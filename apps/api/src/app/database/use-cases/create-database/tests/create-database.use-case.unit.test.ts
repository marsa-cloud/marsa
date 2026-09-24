import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { CreateDatabaseCommandBuilder } from '#src/app/database/use-cases/create-database/create-database.command.builder.js'
import { CreateDatabaseRepository } from '#src/app/database/use-cases/create-database/create-database.repository.js'
import { CreateDatabaseUseCase } from '#src/app/database/use-cases/create-database/create-database.use-case.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { DatabaseCredentialsCipher } from '#src/modules/crypto/database-credentials.cipher.js'
import { MockDatabaseRuntime } from '#src/modules/runtime/adapters/mock/mock-database-runtime.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().build()
const environment = new EnvironmentBuilder().withProject(project).build()

function build() {
  const repository = createStubInstance(CreateDatabaseRepository)
  repository.lockEnvironment.resolves({ environment, project })
  repository.isNameTaken.resolves(false)
  repository.insert.resolves('inserted')

  const cipher = createStubInstance(DatabaseCredentialsCipher)
  cipher.seal.returns('sealed-token')

  const runtime = createStubInstance(MockDatabaseRuntime)
  runtime.provision.resolves()

  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('local-path')

  const usecase = new CreateDatabaseUseCase(stubDatabase(), repository, cipher, runtime, config)
  const command = new CreateDatabaseCommandBuilder()
    .withEnvironmentUuid(environment.uuid)
    .withSlug('orders')
    .build()

  return { repository, cipher, runtime, usecase, command }
}

describe('CreateDatabaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('inserts the row, then provisions the runtime last', async () => {
    const { repository, runtime, usecase, command } = build()

    await usecase.execute(command)

    expect(repository.insert.calledOnce).toBe(true)
    expect(runtime.provision.calledOnce).toBe(true)
    expect(repository.insert.getCall(0).calledBefore(runtime.provision.getCall(0))).toBe(true)
  })

  it('resolves the pinned image from the catalogue and seals the credentials', async () => {
    const { repository, cipher, usecase, command } = build()

    await usecase.execute(command)

    expect(repository.insert.firstCall.args[1]).toMatchObject({
      image: 'postgres:17.11',
      credentialsEnc: 'sealed-token',
      storageGib: 10,
    })
    expect(cipher.seal.firstCall.args[0]).toMatchObject({ user: 'postgres', database: 'orders' })
  })

  it('passes the configured storage class and the composed variables to the runtime', async () => {
    const { runtime, usecase, command } = build()

    await usecase.execute(command)

    const [ref, spec] = runtime.provision.firstCall.args
    expect(ref).toMatchObject({ database: { slug: 'orders' }, project: { slug: project.slug } })
    expect(spec).toMatchObject({
      image: 'postgres:17.11',
      port: 5432,
      storageClass: 'local-path',
      nodePin: null,
    })
    expect(spec.publishedVariables.PGHOST).toBe('orders')
    expect(spec.publishedVariables.DATABASE_URL).toContain('@orders:5432/orders')
  })

  it('throws 404 for a version the catalogue does not carry', async () => {
    const { runtime, usecase } = build()
    const command = new CreateDatabaseCommandBuilder().withVersion('15').build()

    await expect(usecase.execute(command)).rejects.toThrow(NotFoundException)

    expect(runtime.provision.called).toBe(false)
  })

  it('throws 404 when the environment does not exist', async () => {
    const { repository, runtime, usecase, command } = build()
    repository.lockEnvironment.resolves(undefined)

    await expect(usecase.execute(command)).rejects.toThrow(NotFoundException)

    expect(runtime.provision.called).toBe(false)
  })

  it('throws 409 when an app or database already owns the name', async () => {
    const { repository, runtime, usecase, command } = build()
    repository.isNameTaken.resolves(true)

    await expect(usecase.execute(command)).rejects.toThrow(ConflictException)

    expect(repository.insert.called).toBe(false)
    expect(runtime.provision.called).toBe(false)
  })

  it('throws 409 when a database in another environment already owns the slug', async () => {
    const { repository, runtime, usecase, command } = build()
    repository.insert.resolves('slug-taken')

    await expect(usecase.execute(command)).rejects.toThrow(ConflictException)

    expect(runtime.provision.called).toBe(false)
  })

  it('maps a runtime failure to 502 so the row rolls back', async () => {
    const { runtime, usecase, command } = build()
    runtime.provision.rejects(new Error('cluster down'))

    await expect(usecase.execute(command)).rejects.toThrow(BadGatewayException)
  })
})
