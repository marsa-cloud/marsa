import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppDeletionState } from '#src/app/app-management/enums/app-deletion-state.enum.js'
import { AppDeletionConflictError } from '#src/app/app-management/errors/app-deletion-conflict.error.js'
import {
  appDeletionState,
  assertAppNotDeleting,
} from '#src/app/app-management/queries/app-deletion.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('appDeletionState', () => {
  before(() => TestBench.setupUnitTest())

  it('derives active from nulls', () => {
    const app = new AppBuilder().build()

    expect(appDeletionState(app)).toBe(AppDeletionState.Active)
  })

  it('derives deleting from deletionRequestedAt alone', () => {
    const app = new AppBuilder().withDeletionRequested().build()

    expect(appDeletionState(app)).toBe(AppDeletionState.Deleting)
  })

  it('derives deletion_failed when deletionFailedAt is set, even if deletionRequestedAt is too', () => {
    const app = new AppBuilder().withDeletionFailed('registry unreachable').build()

    expect(app.deletionRequestedAt).toBeDefined()
    expect(appDeletionState(app)).toBe(AppDeletionState.DeletionFailed)
  })
})

describe('assertAppNotDeleting', () => {
  before(() => TestBench.setupUnitTest())

  it('passes for an active app', () => {
    const app = new AppBuilder().build()

    expect(() => assertAppNotDeleting(app)).not.toThrow()
  })

  it('throws for a deleting app', () => {
    const app = new AppBuilder().withDeletionRequested().build()

    expect(() => assertAppNotDeleting(app)).toThrow(
      new AppDeletionConflictError(`App '${app.slug}' is being deleted.`),
    )
  })

  it('throws for a deletion_failed app', () => {
    const app = new AppBuilder().withDeletionFailed('registry: boom').build()

    expect(() => assertAppNotDeleting(app)).toThrow(
      new AppDeletionConflictError(`App '${app.slug}' is being deleted.`),
    )
  })
})
