import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import { DeleteEnvironmentUseCase } from '#src/app/environment/use-cases/delete-environment/delete-environment.use-case.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().withSlug('demo').build()
const environment = new EnvironmentBuilder().withProject(project).withSlug('dev').build()

function build() {
  const repository = createStubInstance(DeleteEnvironmentRepository)
  repository.findBySlugs.resolves({ project, environment })
  repository.delete.resolves()
  const namespaces = createStubInstance(MockNamespaceBackend)
  namespaces.destroy.resolves()
  return {
    usecase: new DeleteEnvironmentUseCase(stubDatabase(), repository, namespaces),
    repository,
    namespaces,
  }
}

describe('DeleteEnvironmentUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes the row and destroys its namespace', async () => {
    const { usecase, repository, namespaces } = build()

    await usecase.execute('demo', 'dev')

    expect(repository.delete.firstCall.args[1]).toBe(environment.uuid)
    expect(namespaces.destroy.calledOnceWithExactly('demo-dev', environment.uuid)).toBe(true)
  })

  it('throws 404 for an unknown environment', async () => {
    const { usecase, repository } = build()
    repository.findBySlugs.resolves(undefined)

    await expect(usecase.execute('demo', 'ghost')).rejects.toThrow(NotFoundException)
  })

  it('throws 409 while the environment still has apps and leaves the namespace alone', async () => {
    const { usecase, repository, namespaces } = build()
    repository.delete.rejects(Object.assign(new Error('restrict'), { code: '23001' }))

    await expect(usecase.execute('demo', 'dev')).rejects.toThrow(ConflictException)
    expect(namespaces.destroy.called).toBe(false)
  })

  it('throws 502 when the namespace cannot be deleted', async () => {
    const { usecase, namespaces } = build()
    namespaces.destroy.rejects(new Error('connection refused'))

    await expect(usecase.execute('demo', 'dev')).rejects.toThrow(BadGatewayException)
  })
})
