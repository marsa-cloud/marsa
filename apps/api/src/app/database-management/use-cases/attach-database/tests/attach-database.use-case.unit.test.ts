import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { DatabaseBuilder } from '#src/app/database-management/entities/database.builder.js'
import { AttachDatabaseCommandBuilder } from '#src/app/database-management/use-cases/attach-database/attach-database.command.builder.js'
import { AttachDatabaseRepository } from '#src/app/database-management/use-cases/attach-database/attach-database.repository.js'
import { AttachDatabaseUseCase } from '#src/app/database-management/use-cases/attach-database/attach-database.use-case.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()
const liveRelease = new ReleaseBuilder().withApp(placement.app).build()

function build() {
  const repository = createStubInstance(AttachDatabaseRepository)
  repository.lockApp.resolves(placement)
  repository.findDatabaseInEnvironment.resolves(
    new DatabaseBuilder()
      .withEnvironmentUuid(placement.environment.uuid)
      .withSlug('orders')
      .build(),
  )
  repository.insert.resolves('inserted')
  repository.findAttachments.resolves([])
  repository.findRelease.resolves(liveRelease)

  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.readLiveReleaseUuid.resolves(null)
  appRuntime.deploy.resolves()

  const cipher = createStubInstance(ImagePullCredentialsCipher)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')

  return {
    repository,
    appRuntime,
    usecase: new AttachDatabaseUseCase(stubDatabase(), repository, appRuntime, cipher, config),
    command: new AttachDatabaseCommandBuilder().withDatabaseSlug('orders').build(),
  }
}

describe('AttachDatabaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the attachment and reports the variables it injects', async () => {
    const { repository, usecase, command } = build()

    const response = await usecase.execute('my-app', command)

    expect(repository.insert.calledOnce).toBe(true)
    expect(response.variables).toEqual([
      'DATABASE_URL',
      'PGHOST',
      'PGPORT',
      'PGUSER',
      'PGPASSWORD',
      'PGDATABASE',
    ])
  })

  it('prefixes the reported variables when an alias is given', async () => {
    const { usecase } = build()
    const command = new AttachDatabaseCommandBuilder()
      .withDatabaseSlug('orders')
      .withAlias('analytics')
      .build()

    const response = await usecase.execute('my-app', command)

    expect(response.variables[0]).toBe('ANALYTICS_DATABASE_URL')
  })

  it('throws 404 for an unknown app', async () => {
    const { repository, usecase, command } = build()
    repository.lockApp.resolves(undefined)

    await expect(usecase.execute('ghost', command)).rejects.toThrow(NotFoundException)
  })

  it("throws 404 when the database is not in this app's environment", async () => {
    const { repository, usecase, command } = build()
    repository.findDatabaseInEnvironment.resolves(undefined)

    await expect(usecase.execute('my-app', command)).rejects.toThrow(NotFoundException)
  })

  it('throws 409 naming the fix when a second attachment has no alias', async () => {
    const { repository, usecase, command } = build()
    repository.insert.resolves('alias-taken')

    await expect(usecase.execute('my-app', command)).rejects.toThrow(/Pass an alias/)
  })

  it('throws 409 when the same database is attached twice', async () => {
    const { repository, usecase, command } = build()
    repository.insert.resolves('already-attached')

    await expect(usecase.execute('my-app', command)).rejects.toThrow(ConflictException)
  })

  it('does not touch the runtime when the app has never deployed', async () => {
    const { appRuntime, usecase, command } = build()

    await usecase.execute('my-app', command)

    expect(appRuntime.deploy.called).toBe(false)
  })

  it('re-applies the live release so a running app picks the variables up', async () => {
    const { appRuntime, usecase, command } = build()
    appRuntime.readLiveReleaseUuid.resolves(liveRelease.uuid)

    await usecase.execute('my-app', command)

    expect(appRuntime.deploy.calledOnce).toBe(true)
  })

  it('maps a runtime failure to 502 so the attachment rolls back', async () => {
    const { appRuntime, usecase, command } = build()
    appRuntime.readLiveReleaseUuid.resolves(liveRelease.uuid)
    appRuntime.deploy.rejects(new Error('cluster down'))

    await expect(usecase.execute('my-app', command)).rejects.toThrow(BadGatewayException)
  })
})
