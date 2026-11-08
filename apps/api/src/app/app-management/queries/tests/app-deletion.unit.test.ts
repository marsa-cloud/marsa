import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppDeletionState } from '#src/app/app-management/enums/app-deletion-state.enum.js'
import { appDeletionState } from '#src/app/app-management/queries/app-deletion.js'
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
