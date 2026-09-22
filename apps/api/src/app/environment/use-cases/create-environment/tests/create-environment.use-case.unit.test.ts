import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { CreateEnvironmentCommandBuilder } from '#src/app/environment/use-cases/create-environment/create-environment.command.builder.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentUseCase } from '#src/app/environment/use-cases/create-environment/create-environment.use-case.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().withSlug('demo').build()

function build() {
  const repository = createStubInstance(CreateEnvironmentRepository)
  repository.findProjectBySlug.resolves(project)
  repository.insert.resolves(true)
  const environments = createStubInstance(MockEnvironmentRuntime)
  environments.provision.resolves()
  return {
    usecase: new CreateEnvironmentUseCase(stubDatabase(), repository, environments),
    repository,
    environments,
  }
}

const command = () => new CreateEnvironmentCommandBuilder().withName('Dev').withSlug('dev').build()

describe('CreateEnvironmentUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the environment and provisions it', async () => {
    const { usecase, repository, environments } = build()

    const result = await usecase.execute('demo', command())

    const [, environment] = repository.insert.firstCall.args
    expect(environment).toMatchObject({ projectUuid: project.uuid, name: 'Dev', slug: 'dev' })
    expect(environments.provision.firstCall.args[0]).toEqual({
      uuid: environment.uuid,
      projectSlug: 'demo',
      environmentSlug: 'dev',
    })
    expect(result).toMatchObject({ slug: 'dev', projectSlug: 'demo' })
  })

  it('throws 404 for an unknown project and provisions nothing', async () => {
    const { usecase, repository, environments } = build()
    repository.findProjectBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', command())).rejects.toThrow(NotFoundException)
    expect(environments.provision.called).toBe(false)
  })

  it('throws 409 when the slug is taken in this project', async () => {
    const { usecase, repository } = build()
    repository.insert.resolves(false)

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
  })

  it('maps an environment conflict to 409', async () => {
    const { usecase, environments } = build()
    environments.provision.rejects(new EnvironmentConflictError('taken'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
  })

  it('maps any other cluster failure to 502 and cleans up what it provisioned', async () => {
    const { usecase, repository, environments } = build()
    environments.provision.rejects(new Error('connection refused'))
    environments.destroy.resolves()

    await expect(usecase.execute('demo', command())).rejects.toThrow(BadGatewayException)

    const [, environment] = repository.insert.firstCall.args
    expect(environments.destroy.firstCall.args[0]).toEqual({
      uuid: environment.uuid,
      projectSlug: 'demo',
      environmentSlug: 'dev',
    })
  })

  it('still reports 502 when the cleanup itself fails', async () => {
    const { usecase, environments } = build()
    environments.provision.rejects(new Error('connection refused'))
    environments.destroy.rejects(new Error('still down'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(BadGatewayException)
  })

  it('does not clean up an environment it never owned', async () => {
    const { usecase, environments } = build()
    environments.provision.rejects(new EnvironmentConflictError('taken'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
    expect(environments.destroy.called).toBe(false)
  })
})
