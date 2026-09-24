import { before, describe, it } from 'node:test'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import { DeleteDatabaseRepository } from '#src/app/database/use-cases/delete-database/delete-database.repository.js'
import { DeleteDatabaseUseCase } from '#src/app/database/use-cases/delete-database/delete-database.use-case.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { MockDatabaseRuntime } from '#src/modules/runtime/adapters/mock/mock-database-runtime.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().build()
const environment = new EnvironmentBuilder().withProject(project).build()
const placement = {
  database: new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug('orders').build(),
  environment,
  project,
}

function build() {
  const repository = createStubInstance(DeleteDatabaseRepository)
  repository.findPlacementBySlugForUpdate.resolves(placement)
  repository.delete.resolves()
  const runtime = createStubInstance(MockDatabaseRuntime)
  runtime.destroy.resolves()
  const usecase = new DeleteDatabaseUseCase(stubDatabase(), repository, runtime)
  return { repository, runtime, usecase }
}

describe('DeleteDatabaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes the row, then destroys the runtime resources', async () => {
    const { repository, runtime, usecase } = build()

    await usecase.execute('orders')

    expect(repository.delete.calledOnceWithExactly(match.any, placement.database.uuid)).toBe(true)
    expect(repository.delete.getCall(0).calledBefore(runtime.destroy.getCall(0))).toBe(true)
    expect(runtime.destroy.firstCall.args[0]).toMatchObject({
      database: { slug: 'orders' },
      project: { slug: project.slug },
      environment: { slug: environment.slug },
    })
  })

  it('throws 404 for an unknown slug and touches neither the runtime nor the rows', async () => {
    const { repository, runtime, usecase } = build()
    repository.findPlacementBySlugForUpdate.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)

    expect(repository.delete.called).toBe(false)
    expect(runtime.destroy.called).toBe(false)
  })

  it('maps a runtime failure to 502 so the row rolls back', async () => {
    const { runtime, usecase } = build()
    runtime.destroy.rejects(new Error('cluster down'))

    await expect(usecase.execute('orders')).rejects.toThrow(BadGatewayException)
  })
})
