import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { CreateReleaseRepository } from '#src/app/release/use-cases/create-release/create-release.repository.js'
import { CreateReleaseUseCase } from '#src/app/release/use-cases/create-release/create-release.use-case.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const app = new AppBuilder()
  .withSlug('my-app')
  .withImage('nginx:1.28')
  .withContainerPort(8080)
  .withEnv({ NEW: '1' })
  .build()

const old = new ReleaseBuilder()
  .withApp(new AppBuilder().withImage('nginx:1.27').withEnv({ OLD: '1' }).build())
  .build()
old.appUuid = app.uuid

function build() {
  const repository = createStubInstance(CreateReleaseRepository)
  repository.findAppBySlug.resolves(app)
  repository.findRelease.resolves(old)
  repository.insertRelease.resolves()
  repository.restoreAppConfig.resolves()
  return { usecase: new CreateReleaseUseCase(stubDatabase(), repository), repository }
}

describe('CreateReleaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('snapshots the current app config as a pending manual release', async () => {
    const { usecase, repository } = build()

    const result = await usecase.execute('my-app', {})

    const [, release] = repository.insertRelease.firstCall.args
    expect(repository.findAppBySlug.calledOnceWithExactly(match.any, 'my-app')).toBe(true)
    expect(release).toMatchObject({
      appUuid: app.uuid,
      imageRef: 'nginx:1.28',
      containerPort: 8080,
      env: { NEW: '1' },
      triggeredBy: ReleaseTrigger.Manual,
      deployStatus: DeployStatus.Pending,
      sourceReleaseUuid: null,
    })
    expect(repository.restoreAppConfig.called).toBe(false)
    expect(result).toEqual({
      releaseUuid: release.uuid,
      appSlug: 'my-app',
      triggeredBy: 'manual',
      sourceReleaseUuid: null,
    })
  })

  it('rolls back by copying the source snapshot and restoring it onto the app', async () => {
    const { usecase, repository } = build()

    const result = await usecase.execute('my-app', { fromReleaseUuid: old.uuid })

    const [, release] = repository.insertRelease.firstCall.args
    const [, restoredUuid, restored] = repository.restoreAppConfig.firstCall.args
    expect(release).toMatchObject({
      imageRef: 'nginx:1.27',
      env: { OLD: '1' },
      triggeredBy: ReleaseTrigger.Rollback,
      sourceReleaseUuid: old.uuid,
    })
    expect(release.uuid).not.toBe(old.uuid)
    expect(restoredUuid).toBe(app.uuid)
    expect(restored).toMatchObject({ image: 'nginx:1.27', env: { OLD: '1' } })
    expect(result.sourceReleaseUuid).toBe(old.uuid)
  })

  it('rejects a source release that belongs to another app', async () => {
    const { usecase, repository } = build()
    repository.findRelease.resolves(new ReleaseBuilder().build())

    await expect(usecase.execute('my-app', { fromReleaseUuid: old.uuid })).rejects.toThrow(
      NotFoundException,
    )
    expect(repository.insertRelease.called).toBe(false)
  })

  it('throws NotFound for an unknown app', async () => {
    const { usecase, repository } = build()
    repository.findAppBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', {})).rejects.toThrow(NotFoundException)
  })
})
