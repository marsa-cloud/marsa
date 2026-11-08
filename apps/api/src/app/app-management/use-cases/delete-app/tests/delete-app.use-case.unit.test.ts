import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppDeletedDomainEvent } from '#src/app/app-management/events/app-deleted.event.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()

function build(app = placement.app) {
  const repository = createStubInstance(DeleteAppRepository)
  repository.findBySlug.resolves({ ...placement, app })
  const emitter = createStubInstance(DomainEventEmitter)
  emitter.emit.resolves()
  const usecase = new DeleteAppUseCase(stubDatabase(), repository, emitter)
  return { repository, emitter, usecase }
}

describe('DeleteAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('marks a fresh app deletion-requested and emits the event once', async () => {
    const { repository, emitter, usecase } = build()

    await usecase.execute('my-app')

    expect(
      repository.markDeletionRequested.calledOnceWithExactly(match.any, placement.app.uuid),
    ).toBe(true)
    expect(emitter.emit.calledOnce).toBe(true)
    const [tx, events] = emitter.emit.firstCall.args
    expect(tx).toBeDefined()
    expect(events).toEqual([
      new AppDeletedDomainEvent({
        appUuid: placement.app.uuid,
        slug: 'my-app',
        placement,
      }),
    ])
  })

  it('throws 404 for an unknown slug without writing or emitting', async () => {
    const { repository, emitter, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)

    expect(repository.markDeletionRequested.called).toBe(false)
    expect(emitter.emit.called).toBe(false)
  })

  it('does not emit a second chain for an already-deleting app', async () => {
    const app = new AppBuilder().withSlug('my-app').withDeletionRequested().build()
    const { repository, emitter, usecase } = build(app)

    await usecase.execute('my-app')

    expect(repository.markDeletionRequested.called).toBe(false)
    expect(repository.clearDeletionFailure.called).toBe(false)
    expect(emitter.emit.called).toBe(false)
  })

  it('clears the failure and re-emits for a deletion_failed app (retry path)', async () => {
    const app = new AppBuilder().withSlug('my-app').withDeletionFailed('registry: boom').build()
    const { repository, emitter, usecase } = build(app)

    await usecase.execute('my-app')

    expect(repository.clearDeletionFailure.calledOnceWithExactly(match.any, app.uuid)).toBe(true)
    expect(repository.markDeletionRequested.called).toBe(false)
    expect(emitter.emit.calledOnce).toBe(true)
  })
})
