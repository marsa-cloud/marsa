import { before, describe, it } from 'node:test'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(DeleteAppRepository)
  const appRuntime = createStubInstance(MockAppRuntime)
  const usecase = new DeleteAppUseCase(repository, appRuntime)
  return { repository, appRuntime, usecase }
}

describe('DeleteAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('tears down the cluster resources before deleting the rows', async () => {
    const placement = new AppPlacementBuilder()
      .withApp(new AppBuilder().withSlug('my-app').build())
      .build()
    const { repository, appRuntime, usecase } = build()
    repository.findBySlug.resolves(placement)

    await usecase.execute('my-app')

    expect(appRuntime.destroy.calledOnce).toBe(true)
    expect(appRuntime.destroy.firstCall.args[0]).toMatchObject({
      slug: 'my-app',
      environment: { projectSlug: 'my-project', environmentSlug: 'production' },
    })
    expect(repository.deleteWithReleases.calledOnceWith(placement.app.uuid)).toBe(true)
    expect(
      appRuntime.destroy.getCall(0).calledBefore(repository.deleteWithReleases.getCall(0)),
    ).toBe(true)
  })

  it('throws 404 for an unknown slug and touches neither the cluster nor the rows', async () => {
    const { repository, appRuntime, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)

    expect(appRuntime.destroy.called).toBe(false)
    expect(repository.deleteWithReleases.called).toBe(false)
  })

  it('throws 502 and keeps the rows when teardown fails, so the delete can be retried', async () => {
    const { repository, appRuntime, usecase } = build()
    repository.findBySlug.resolves(
      new AppPlacementBuilder().withApp(new AppBuilder().withSlug('my-app').build()).build(),
    )
    appRuntime.destroy.rejects(new Error('connection refused'))

    await expect(usecase.execute('my-app')).rejects.toThrow(BadGatewayException)

    expect(repository.deleteWithReleases.called).toBe(false)
  })
})
