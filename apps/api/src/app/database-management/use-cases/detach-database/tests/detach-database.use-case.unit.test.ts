import { before, describe, it } from 'node:test'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { DetachDatabaseRepository } from '#src/app/database-management/use-cases/detach-database/detach-database.repository.js'
import { DetachDatabaseUseCase } from '#src/app/database-management/use-cases/detach-database/detach-database.use-case.js'
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
  const repository = createStubInstance(DetachDatabaseRepository)
  repository.lockApp.resolves(placement)
  repository.deleteAttachment.resolves(true)
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
    usecase: new DetachDatabaseUseCase(stubDatabase(), repository, appRuntime, cipher, config),
  }
}

describe('DetachDatabaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('removes the attachment, then re-applies the live release', async () => {
    const { repository, appRuntime, usecase } = build()
    appRuntime.readLiveReleaseUuid.resolves(liveRelease.uuid)

    await usecase.execute('my-app', 'orders')

    expect(repository.deleteAttachment.calledOnce).toBe(true)
    expect(repository.deleteAttachment.getCall(0).calledBefore(appRuntime.deploy.getCall(0))).toBe(
      true,
    )
  })

  it('throws 404 for an unknown app', async () => {
    const { repository, usecase } = build()
    repository.lockApp.resolves(undefined)

    await expect(usecase.execute('ghost', 'orders')).rejects.toThrow(NotFoundException)
  })

  it('throws 404 when that database is not attached to the app', async () => {
    const { repository, appRuntime, usecase } = build()
    repository.deleteAttachment.resolves(false)

    await expect(usecase.execute('my-app', 'orders')).rejects.toThrow(NotFoundException)

    expect(appRuntime.deploy.called).toBe(false)
  })

  it('maps a runtime failure to 502 so the attachment stays', async () => {
    const { appRuntime, usecase } = build()
    appRuntime.readLiveReleaseUuid.resolves(liveRelease.uuid)
    appRuntime.deploy.rejects(new Error('cluster down'))

    await expect(usecase.execute('my-app', 'orders')).rejects.toThrow(BadGatewayException)
  })
})
