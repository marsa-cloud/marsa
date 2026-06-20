import { after, before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { expect } from 'expect'

import { ManifestState } from '#src/app/github-app/entities/manifest-state.entity.js'
import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import { ManifestStateModule } from '#src/app/github-app/manifest-state/manifest-state.module.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

// The service forks its own EM and commits (issue/consume must outlive a single
// request), so rows don't ride the TestSetup transaction — we wipe the table in
// `after` instead of relying on rollback.
describe('ManifestStateService (db)', () => {
  let setup: TestSetup
  let service: ManifestStateService
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupModuleTest(ManifestStateModule)
    service = setup.testModule.get(ManifestStateService)
    em = setup.testModule.get(EntityManager)
  })

  after(async () => {
    await em.fork().nativeDelete(ManifestState, {})
    await setup.teardown()
  })

  it('issues a token that consumes exactly once (single-use)', async () => {
    const state = await service.issue()

    expect(await service.consume(state)).toBe(true)
    expect(await service.consume(state)).toBe(false)
  })

  it('rejects an unknown token', async () => {
    expect(await service.consume(generateUuid())).toBe(false)
  })

  it('rejects an expired token', async () => {
    const state = await service.issue(-1000)

    expect(await service.consume(state)).toBe(false)
  })

  it('rejects a malformed (non-uuid) token without touching the db', async () => {
    expect(await service.consume('not-a-uuid' as ManifestStateUuid)).toBe(false)
  })
})
