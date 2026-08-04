import { before, describe, it } from 'node:test'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(DeleteAppRepository)
  const deployBackend = createStubInstance(MockDeployBackend)
  const usecase = new DeleteAppUseCase(repository, deployBackend)
  return { repository, deployBackend, usecase }
}

describe('DeleteAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('tears down the cluster resources before deleting the rows', async () => {
    const app = new AppBuilder().withSlug('my-app').build()
    const { repository, deployBackend, usecase } = build()
    repository.findBySlug.resolves(app)

    await usecase.execute('my-app')

    expect(deployBackend.destroy.calledOnceWith('marsa-apps', 'my-app')).toBe(true)
    expect(repository.deleteWithReleases.calledOnceWith(app.uuid)).toBe(true)
    expect(
      deployBackend.destroy.getCall(0).calledBefore(repository.deleteWithReleases.getCall(0)),
    ).toBe(true)
  })

  it('throws 404 for an unknown slug and touches neither the cluster nor the rows', async () => {
    const { repository, deployBackend, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)

    expect(deployBackend.destroy.called).toBe(false)
    expect(repository.deleteWithReleases.called).toBe(false)
  })

  it('throws 502 and keeps the rows when teardown fails, so the delete can be retried', async () => {
    const { repository, deployBackend, usecase } = build()
    repository.findBySlug.resolves(new AppBuilder().withSlug('my-app').build())
    deployBackend.destroy.rejects(new Error('connection refused'))

    await expect(usecase.execute('my-app')).rejects.toThrow(BadGatewayException)

    expect(repository.deleteWithReleases.called).toBe(false)
  })
})
