import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { CreateEnvironmentCommandBuilder } from '#src/app/environment/use-cases/create-environment/create-environment.command.builder.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentUseCase } from '#src/app/environment/use-cases/create-environment/create-environment.use-case.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { NamespaceConflictError } from '#src/modules/kubernetes/namespace-backend.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().withSlug('demo').build()

function build() {
  const repository = createStubInstance(CreateEnvironmentRepository)
  repository.findProjectBySlug.resolves(project)
  repository.insert.resolves(true)
  const namespaces = createStubInstance(MockNamespaceBackend)
  namespaces.provision.resolves()
  return {
    usecase: new CreateEnvironmentUseCase(stubDatabase(), repository, namespaces),
    repository,
    namespaces,
  }
}

const command = () => new CreateEnvironmentCommandBuilder().withName('Dev').withSlug('dev').build()

describe('CreateEnvironmentUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the environment and provisions its derived namespace', async () => {
    const { usecase, repository, namespaces } = build()

    const result = await usecase.execute('demo', command())

    const [, environment] = repository.insert.firstCall.args
    expect(environment).toMatchObject({ projectUuid: project.uuid, name: 'Dev', slug: 'dev' })
    expect(namespaces.provision.calledOnceWithExactly('demo-dev', environment.uuid)).toBe(true)
    expect(result).toMatchObject({ slug: 'dev', namespace: 'demo-dev', projectSlug: 'demo' })
  })

  it('throws 404 for an unknown project and provisions nothing', async () => {
    const { usecase, repository, namespaces } = build()
    repository.findProjectBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', command())).rejects.toThrow(NotFoundException)
    expect(namespaces.provision.called).toBe(false)
  })

  it('throws 409 when the slug is taken in this project', async () => {
    const { usecase, repository } = build()
    repository.insert.resolves(false)

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
  })

  it('maps a namespace conflict to 409', async () => {
    const { usecase, namespaces } = build()
    namespaces.provision.rejects(new NamespaceConflictError('taken'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
  })

  it('maps any other cluster failure to 502 and cleans up what it provisioned', async () => {
    const { usecase, repository, namespaces } = build()
    namespaces.provision.rejects(new Error('connection refused'))
    namespaces.destroy.resolves()

    await expect(usecase.execute('demo', command())).rejects.toThrow(BadGatewayException)

    const [, environment] = repository.insert.firstCall.args
    expect(namespaces.destroy.calledOnceWithExactly('demo-dev', environment.uuid)).toBe(true)
  })

  it('still reports 502 when the cleanup itself fails', async () => {
    const { usecase, namespaces } = build()
    namespaces.provision.rejects(new Error('connection refused'))
    namespaces.destroy.rejects(new Error('still down'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(BadGatewayException)
  })

  it('does not clean up a namespace it never owned', async () => {
    const { usecase, namespaces } = build()
    namespaces.provision.rejects(new NamespaceConflictError('taken'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
    expect(namespaces.destroy.called).toBe(false)
  })
})
