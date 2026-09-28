import { before, describe, it } from 'node:test'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()
const runningBuild = new BuildBuilder().withApp(placement.app).build()

function build() {
  const repository = createStubInstance(DeleteAppRepository)
  repository.findBySlug.resolves(placement)
  repository.deleteWithHistory.resolves()
  repository.findRunningBuilds.resolves([runningBuild])
  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.destroy.resolves()
  const imageRegistry = createStubInstance(MockImageRegistry)
  imageRegistry.deleteRepository.resolves()
  const buildRuntime = createStubInstance(MockBuildRuntime)
  buildRuntime.cancel.resolves()
  const usecase = new DeleteAppUseCase(
    stubDatabase(),
    repository,
    appRuntime,
    imageRegistry,
    buildRuntime,
  )
  return { repository, appRuntime, imageRegistry, buildRuntime, usecase }
}

describe('DeleteAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes the app registry repository after removing it from the runtime', async () => {
    const { appRuntime, imageRegistry, usecase } = build()

    await usecase.execute('my-app')

    expect(imageRegistry.deleteRepository.calledOnceWithExactly('my-app')).toBe(true)
    expect(
      appRuntime.destroy.getCall(0).calledBefore(imageRegistry.deleteRepository.getCall(0)),
    ).toBe(true)
  })

  it('cancels the running builds before deleting the registry repository', async () => {
    const { buildRuntime, imageRegistry, usecase } = build()

    await usecase.execute('my-app')

    expect(
      buildRuntime.cancel.calledOnceWithExactly({
        build: { uuid: runningBuild.uuid },
        app: { slug: 'my-app' },
      }),
    ).toBe(true)
    expect(
      buildRuntime.cancel.getCall(0).calledBefore(imageRegistry.deleteRepository.getCall(0)),
    ).toBe(true)
  })

  it('maps a failed build cancel to 502 and keeps the registry repository', async () => {
    const { buildRuntime, imageRegistry, usecase } = build()
    buildRuntime.cancel.rejects(new Error('cluster down'))

    await expect(usecase.execute('my-app')).rejects.toThrow(BadGatewayException)
    expect(imageRegistry.deleteRepository.called).toBe(false)
  })

  it('maps a registry failure to 502 so the rows roll back and the delete can be retried', async () => {
    const { imageRegistry, usecase } = build()
    imageRegistry.deleteRepository.rejects(new Error('registry down'))

    await expect(usecase.execute('my-app')).rejects.toThrow(BadGatewayException)
  })

  it('deletes the rows, then removes the app from the runtime', async () => {
    const { repository, appRuntime, usecase } = build()

    await usecase.execute('my-app')

    expect(repository.findBySlug.calledOnceWithExactly(match.any, 'my-app')).toBe(true)
    expect(repository.deleteWithHistory.calledOnceWithExactly(match.any, placement.app.uuid)).toBe(
      true,
    )
    expect(appRuntime.destroy.firstCall.args[0]).toMatchObject({
      app: { slug: 'my-app' },
      project: { slug: 'my-project' },
      environment: { slug: 'production' },
    })
    expect(
      repository.deleteWithHistory.getCall(0).calledBefore(appRuntime.destroy.getCall(0)),
    ).toBe(true)
  })

  it('throws 404 for an unknown slug and touches neither the runtime nor the rows', async () => {
    const { repository, appRuntime, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)

    expect(appRuntime.destroy.called).toBe(false)
    expect(repository.deleteWithHistory.called).toBe(false)
  })

  it('maps a runtime failure to 502 so the transaction rolls the rows back', async () => {
    const { appRuntime, usecase } = build()
    appRuntime.destroy.rejects(new Error('connection refused'))

    await expect(usecase.execute('my-app')).rejects.toThrow(BadGatewayException)
  })
})
