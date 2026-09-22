import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import { DeleteEnvironmentUseCase } from '#src/app/environment/use-cases/delete-environment/delete-environment.use-case.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().withSlug('demo').build()
const environment = new EnvironmentBuilder().withProject(project).withSlug('dev').build()

function build() {
  const repository = createStubInstance(DeleteEnvironmentRepository)
  repository.findBySlugs.resolves({ project, environment })
  repository.delete.resolves()
  const environments = createStubInstance(MockEnvironmentRuntime)
  environments.destroy.resolves()
  return {
    usecase: new DeleteEnvironmentUseCase(stubDatabase(), repository, environments),
    repository,
    environments,
  }
}

describe('DeleteEnvironmentUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes the row and removes the environment from the runtime', async () => {
    const { usecase, repository, environments } = build()

    await usecase.execute('demo', 'dev')

    expect(repository.delete.firstCall.args[1]).toBe(environment.uuid)
    expect(environments.destroy.firstCall.args[0]).toMatchObject({
      project: { slug: 'demo' },
      environment: { uuid: environment.uuid, slug: 'dev' },
    })
  })

  it('throws 404 for an unknown environment', async () => {
    const { usecase, repository } = build()
    repository.findBySlugs.resolves(undefined)

    await expect(usecase.execute('demo', 'ghost')).rejects.toThrow(NotFoundException)
  })

  it('throws 409 while the environment still has apps and leaves the environment alone', async () => {
    const { usecase, repository, environments } = build()
    repository.delete.rejects(Object.assign(new Error('restrict'), { code: '23001' }))

    await expect(usecase.execute('demo', 'dev')).rejects.toThrow(ConflictException)
    expect(environments.destroy.called).toBe(false)
  })

  it('throws 502 when the environment cannot be removed', async () => {
    const { usecase, environments } = build()
    environments.destroy.rejects(new Error('connection refused'))

    await expect(usecase.execute('demo', 'dev')).rejects.toThrow(BadGatewayException)
  })
})
