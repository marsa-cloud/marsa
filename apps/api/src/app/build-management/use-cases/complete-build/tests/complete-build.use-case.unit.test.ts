import { before, describe, it } from 'node:test'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BUILD_DISAPPEARED } from '#src/app/build-management/use-cases/complete-build/complete-build.constants.js'
import { CompleteBuildRepository } from '#src/app/build-management/use-cases/complete-build/complete-build.repository.js'
import { CompleteBuildUseCase } from '#src/app/build-management/use-cases/complete-build/complete-build.use-case.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { BuildState } from '#src/modules/runtime/runtime.enums.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const SHA = 'e'.repeat(40)
const IMAGE = `registry.mock.test/my-app:${SHA}`
const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()

function build(trigger = BuildTrigger.Manual) {
  const running = new BuildBuilder()
    .withApp(placement.app)
    .withCommitSha(SHA)
    .withTrigger(trigger)
    .build()
  const repository = createStubInstance(CompleteBuildRepository)
  repository.claimRunning.resolves(running)
  repository.findPlacement.resolves(placement)
  repository.finish.resolves()
  repository.setAppImage.resolves()
  repository.insertRelease.resolves()
  repository.setReleaseDeployStatus.resolves()
  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.deploy.resolves()
  const imageRegistry = new MockImageRegistry()
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const usecase = new CompleteBuildUseCase(
    stubDatabase(),
    repository,
    appRuntime,
    imageRegistry,
    cipher,
    config,
  )
  return { usecase, repository, appRuntime, running }
}

describe('CompleteBuildUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('does nothing when another replica already claimed the build', async () => {
    const { usecase, repository, appRuntime, running } = build()
    repository.claimRunning.resolves(undefined)

    await usecase.execute(running.uuid, { state: BuildState.Succeeded })

    expect(repository.finish.called).toBe(false)
    expect(repository.insertRelease.called).toBe(false)
    expect(appRuntime.deploy.called).toBe(false)
  })

  it('leaves a build that is still running alone', async () => {
    const { usecase, repository, running } = build()

    await usecase.execute(running.uuid, { state: BuildState.Running })

    expect(repository.finish.called).toBe(false)
  })

  it('records a failure with its reason and releases nothing', async () => {
    const { usecase, repository, running } = build()

    await usecase.execute(running.uuid, { state: BuildState.Failed, reason: 'no Dockerfile' })

    expect(
      repository.finish.calledOnceWith(match.any, running.uuid, {
        status: BuildStatus.Failed,
        failureReason: 'no Dockerfile',
      }),
    ).toBe(true)
    expect(repository.insertRelease.called).toBe(false)
  })

  it('fails a build whose job disappeared', async () => {
    const { usecase, repository, running } = build()

    await usecase.execute(running.uuid, { state: BuildState.NotFound })

    expect(repository.finish.firstCall.args[2]).toEqual({
      status: BuildStatus.Failed,
      failureReason: BUILD_DISAPPEARED,
    })
  })

  it('turns a successful build into a deployed release', async () => {
    const { usecase, repository, appRuntime, running } = build()

    await usecase.execute(running.uuid, { state: BuildState.Succeeded })

    expect(repository.finish.firstCall.args[2]).toEqual({
      status: BuildStatus.Succeeded,
      imageRef: IMAGE,
    })
    expect(repository.setAppImage.calledOnceWith(match.any, placement.app.uuid, IMAGE)).toBe(true)
    const release = repository.insertRelease.firstCall.args[1]
    expect(release).toMatchObject({
      appUuid: placement.app.uuid,
      buildUuid: running.uuid,
      imageRef: IMAGE,
      triggeredBy: ReleaseTrigger.Manual,
      deployStatus: DeployStatus.Pending,
    })
    const [ref, spec] = appRuntime.deploy.firstCall.args
    expect(ref.app.slug).toBe('my-app')
    expect(spec).toMatchObject({ releaseUuid: release.uuid, image: IMAGE })
  })

  it('marks the release a webhook release for a push build', async () => {
    const { usecase, repository, running } = build(BuildTrigger.Push)

    await usecase.execute(running.uuid, { state: BuildState.Succeeded })

    expect(repository.insertRelease.firstCall.args[1].triggeredBy).toBe(ReleaseTrigger.Webhook)
  })

  it('keeps the build succeeded when the deploy fails', async () => {
    const { usecase, repository, appRuntime, running } = build()
    appRuntime.deploy.rejects(new Error('cluster down'))

    await usecase.execute(running.uuid, { state: BuildState.Succeeded })

    const release = repository.insertRelease.firstCall.args[1]
    expect(
      repository.setReleaseDeployStatus.calledOnceWith(
        match.any,
        release.uuid,
        DeployStatus.Failed,
      ),
    ).toBe(true)
    expect(repository.finish.calledOnce).toBe(true)
  })
})
