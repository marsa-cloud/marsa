import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseUseCase } from '#src/app/release/use-cases/deploy-release/deploy-release.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const app = new AppBuilder().withSlug('my-app').build()

function build(release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()) {
  const repository = createStubInstance(DeployReleaseRepository)
  repository.findRelease.resolves(release)
  repository.findApp.resolves(app)
  repository.findNewestReleaseUuid.resolves(release.uuid)
  repository.setDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.apply.resolves()
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.open.returns({ registry: 'ghcr.io', username: 'org', password: 'pw' })

  const applyRelease = new ApplyReleaseService(deployBackend, cipher, config)
  return {
    usecase: new DeployReleaseUseCase(repository, applyRelease),
    repository,
    deployBackend,
    cipher,
    release,
  }
}

describe('DeployReleaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('resets the release to pending and applies its snapshot', async () => {
    const { usecase, repository, deployBackend, release } = build()

    const result = await usecase.execute(release.uuid)

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

    await usecase.execute(release.uuid)

    expect(cipher.open.calledOnceWithExactly('sealed')).toBe(true)
    expect(deployBackend.apply.firstCall.args[1].imagePullSecret?.metadata?.name).toBe(
      'my-app-registry',
    )
  })

  it('refuses a release that is not the newest with 409', async () => {
    const { usecase, repository, deployBackend, release } = build()
    repository.findNewestReleaseUuid.resolves(new ReleaseBuilder().build().uuid)

    await expect(usecase.execute(release.uuid)).rejects.toThrow(ConflictException)
    expect(deployBackend.apply.called).toBe(false)
    expect(repository.setDeployStatus.called).toBe(false)
  })

  it('marks the release failed and rethrows when the apply fails', async () => {
    const { usecase, repository, deployBackend, release } = build()
    const error = new Error('cluster unreachable')
    deployBackend.apply.rejects(error)

    await expect(usecase.execute(release.uuid)).rejects.toThrow(error)
    expect(repository.setDeployStatus.lastCall.args).toEqual([release.uuid, DeployStatus.Failed])
  })

  it('marks the release failed when the credentials cannot be decrypted', async () => {
    const release = new ReleaseBuilder().withApp({ ...app, imagePullCredentialsEnc: 'bad' }).build()
    const { usecase, repository, cipher } = build(release)
    cipher.open.throws(new Error('bad tag'))

    await expect(usecase.execute(release.uuid)).rejects.toThrow(/could not be decrypted/)
    expect(repository.setDeployStatus.lastCall.args).toEqual([release.uuid, DeployStatus.Failed])
  })

  it('throws NotFound for an unknown release', async () => {
    const { usecase, repository, release } = build()
    repository.findRelease.resolves(undefined)

    await expect(usecase.execute(release.uuid)).rejects.toThrow(NotFoundException)
  })
})
