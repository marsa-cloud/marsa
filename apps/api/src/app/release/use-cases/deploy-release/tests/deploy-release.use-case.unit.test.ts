import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseUseCase } from '#src/app/release/use-cases/deploy-release/deploy-release.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()
const app = placement.app

function build(release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()) {
  const repository = createStubInstance(DeployReleaseRepository)
  repository.findAppWithNewestRelease.resolves({ placement, release })
  repository.setDeployStatus.resolves()

  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.deploy.resolves()
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.openForApp.returns({ registry: 'ghcr.io', username: 'org', password: 'pw' })

  return {
    usecase: new DeployReleaseUseCase(repository, appRuntime, cipher, config),
    repository,
    appRuntime,
    cipher,
    release,
  }
}

const running = () =>
  new ReleaseBuilder().withApp(app).withDeployStatus(DeployStatus.Succeeded).build()

describe('DeployReleaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('rolls out the newest release: pending, then deploys its snapshot', async () => {
    const { usecase, repository, appRuntime, release } = build()

    const result = await usecase.execute('my-app')

    expect(repository.findAppWithNewestRelease.calledOnceWithExactly('my-app')).toBe(true)
    expect(
      repository.setDeployStatus.calledOnceWithExactly(release.uuid, DeployStatus.Pending),
    ).toBe(true)
    const [appRef, spec] = appRuntime.deploy.firstCall.args
    expect(appRef.slug).toBe('my-app')
    expect(spec).toMatchObject({ releaseUuid: release.uuid, image: 'nginx:1.27' })
    expect(result).toEqual({
      releaseUuid: release.uuid,
      appSlug: 'my-app',
      url: 'https://my-app.demo.marsa.cc',
      deployStatus: 'pending',
    })
  })

  it('opens the snapshot’s pull credentials into the spec', async () => {
    const release = new ReleaseBuilder()
      .withApp({ ...app, imagePullCredentialsEnc: 'sealed' })
      .build()
    const { usecase, appRuntime, cipher } = build(release)

    await usecase.execute('my-app')

    expect(cipher.openForApp.calledOnceWithExactly('my-app', 'sealed')).toBe(true)
    expect(appRuntime.deploy.firstCall.args[1].credentials?.registry).toBe('ghcr.io')
  })

  it('marks the rollout failed and rethrows when the apply fails', async () => {
    const { usecase, repository, appRuntime, release } = build()
    const error = new Error('cluster unreachable')
    appRuntime.deploy.rejects(error)

    await expect(usecase.execute('my-app')).rejects.toThrow(error)
    expect(repository.setDeployStatus.lastCall.args).toEqual([release.uuid, DeployStatus.Failed])
  })

  it('marks the rollout failed when the credentials cannot be decrypted', async () => {
    const release = new ReleaseBuilder().withApp({ ...app, imagePullCredentialsEnc: 'bad' }).build()
    const { usecase, repository, cipher } = build(release)
    cipher.openForApp.throws(new Error('could not be decrypted'))

    await expect(usecase.execute('my-app')).rejects.toThrow(/could not be decrypted/)
    expect(repository.setDeployStatus.lastCall.args).toEqual([release.uuid, DeployStatus.Failed])
  })

  it('re-applies a release that is already running without touching its status', async () => {
    const { usecase, repository, appRuntime } = build(running())

    const result = await usecase.execute('my-app')

    expect(appRuntime.deploy.calledOnce).toBe(true)
    expect(repository.setDeployStatus.called).toBe(false)
    expect(result.deployStatus).toBe(DeployStatus.Succeeded)
  })

  it('keeps a running release succeeded when re-applying it fails', async () => {
    const { usecase, repository, appRuntime } = build(running())
    appRuntime.deploy.rejects(new Error('transient apiserver error'))

    await expect(usecase.execute('my-app')).rejects.toThrow('transient apiserver error')
    expect(repository.setDeployStatus.called).toBe(false)
  })

  it('refuses an app with no release with 409', async () => {
    const { usecase, repository, appRuntime } = build()
    repository.findAppWithNewestRelease.resolves({ placement, release: null })

    await expect(usecase.execute('my-app')).rejects.toThrow(ConflictException)
    expect(appRuntime.deploy.called).toBe(false)
  })

  it('throws NotFound for an unknown app', async () => {
    const { usecase, repository } = build()
    repository.findAppWithNewestRelease.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('reports an environment taken by something else as 409 and marks the release failed', async () => {
    const { usecase, appRuntime, repository, release } = build()
    appRuntime.deploy.rejects(new EnvironmentConflictError('taken'))

    await expect(usecase.execute('my-app')).rejects.toThrow(ConflictException)
    expect(repository.setDeployStatus.calledWith(release.uuid, DeployStatus.Failed)).toBe(true)
  })
})
