import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseUseCase } from '#src/app/release/use-cases/deploy-release/deploy-release.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { NamespaceConflictError } from '#src/modules/kubernetes/namespace-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()
const app = placement.app

function build(release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()) {
  const repository = createStubInstance(DeployReleaseRepository)
  repository.findAppWithNewestRelease.resolves({ placement, release })
  repository.setDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.apply.resolves()
  const namespaces = createStubInstance(MockNamespaceBackend)
  namespaces.provision.resolves()
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.open.returns({ registry: 'ghcr.io', username: 'org', password: 'pw' })

  const applyRelease = new ApplyReleaseService(deployBackend, namespaces, cipher, config)
  return {
    usecase: new DeployReleaseUseCase(repository, applyRelease),
    repository,
    deployBackend,
    namespaces,
    cipher,
    release,
  }
}

const running = () =>
  new ReleaseBuilder().withApp(app).withDeployStatus(DeployStatus.Succeeded).build()

describe('DeployReleaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('rolls out the newest release: pending, then applies its snapshot', async () => {
    const { usecase, repository, deployBackend, release } = build()

    const result = await usecase.execute('my-app')

    expect(repository.findAppWithNewestRelease.calledOnceWithExactly('my-app')).toBe(true)
    expect(
      repository.setDeployStatus.calledOnceWithExactly(release.uuid, DeployStatus.Pending),
    ).toBe(true)
    const [, manifests] = deployBackend.apply.firstCall.args
    expect(manifests.deployment.spec?.template.spec?.containers[0].image).toBe('nginx:1.27')
    expect(result).toEqual({
      releaseUuid: release.uuid,
      appSlug: 'my-app',
      url: 'https://my-app.demo.marsa.cc',
      deployStatus: 'pending',
    })
  })

  it('opens the snapshot’s pull credentials into a pull Secret', async () => {
    const release = new ReleaseBuilder()
      .withApp({ ...app, imagePullCredentialsEnc: 'sealed' })
      .build()
    const { usecase, deployBackend, cipher } = build(release)

    await usecase.execute('my-app')

    expect(cipher.open.calledOnceWithExactly('sealed')).toBe(true)
    expect(deployBackend.apply.firstCall.args[1].imagePullSecret?.metadata?.name).toBe(
      'my-app-registry',
    )
  })

  it('marks the rollout failed and rethrows when the apply fails', async () => {
    const { usecase, repository, deployBackend, release } = build()
    const error = new Error('cluster unreachable')
    deployBackend.apply.rejects(error)

    await expect(usecase.execute('my-app')).rejects.toThrow(error)
    expect(repository.setDeployStatus.lastCall.args).toEqual([release.uuid, DeployStatus.Failed])
  })

  it('marks the rollout failed when the credentials cannot be decrypted', async () => {
    const release = new ReleaseBuilder().withApp({ ...app, imagePullCredentialsEnc: 'bad' }).build()
    const { usecase, repository, cipher } = build(release)
    cipher.open.throws(new Error('bad tag'))

    await expect(usecase.execute('my-app')).rejects.toThrow(/could not be decrypted/)
    expect(repository.setDeployStatus.lastCall.args).toEqual([release.uuid, DeployStatus.Failed])
  })

  it('re-applies a release that is already running without touching its status', async () => {
    const { usecase, repository, deployBackend } = build(running())

    const result = await usecase.execute('my-app')

    expect(deployBackend.apply.calledOnce).toBe(true)
    expect(repository.setDeployStatus.called).toBe(false)
    expect(result.deployStatus).toBe(DeployStatus.Succeeded)
  })

  it('keeps a running release succeeded when re-applying it fails', async () => {
    const { usecase, repository, deployBackend } = build(running())
    deployBackend.apply.rejects(new Error('transient apiserver error'))

    await expect(usecase.execute('my-app')).rejects.toThrow('transient apiserver error')
    expect(repository.setDeployStatus.called).toBe(false)
  })

  it('refuses an app with no release with 409', async () => {
    const { usecase, repository, deployBackend } = build()
    repository.findAppWithNewestRelease.resolves({ placement, release: null })

    await expect(usecase.execute('my-app')).rejects.toThrow(ConflictException)
    expect(deployBackend.apply.called).toBe(false)
  })

  it('throws NotFound for an unknown app', async () => {
    const { usecase, repository } = build()
    repository.findAppWithNewestRelease.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('provisions the environment namespace, then applies into it', async () => {
    const { usecase, deployBackend, namespaces } = build()

    await usecase.execute('my-app')

    expect(
      namespaces.provision.calledOnceWithExactly(
        'my-project-production',
        placement.environment.uuid,
      ),
    ).toBe(true)
    expect(deployBackend.apply.firstCall.args[0]).toBe('my-project-production')
    expect(namespaces.provision.firstCall.calledBefore(deployBackend.apply.firstCall)).toBe(true)
  })

  it('reports a namespace taken by something else as 409 and marks the release failed', async () => {
    const { usecase, namespaces, repository, release } = build()
    namespaces.provision.rejects(new NamespaceConflictError('taken'))

    await expect(usecase.execute('my-app')).rejects.toThrow(ConflictException)
    expect(repository.setDeployStatus.calledWith(release.uuid, DeployStatus.Failed)).toBe(true)
  })
})
