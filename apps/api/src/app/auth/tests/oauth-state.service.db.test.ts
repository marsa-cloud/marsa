import { after, before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { expect } from 'expect'

import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'
import { OAuthStateModule } from '#src/app/auth/oauth-state.module.js'
import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

// The service forks its own EM and commits (issue/consume must outlive a single
// request), so rows don't ride the TestSetup transaction — we wipe the table in
// `after` instead of relying on rollback.
describe('OAuthStateService (db)', () => {
  let setup: TestSetup
  let service: OAuthStateService
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupModuleTest(OAuthStateModule)
    service = setup.testModule.get(OAuthStateService)
    em = setup.testModule.get(EntityManager)
  })

  after(async () => {
    await em.fork().nativeDelete(OAuthState, {})
    await setup.teardown()
  })

  it('issues a token that consumes exactly once (single-use)', async () => {
    const state = await service.issue()

    expect(await service.consume(state)).toBe(true)
    expect(await service.consume(state)).toBe(false)
  })

  it('rejects an unknown token', async () => {
    expect(await service.consume('00000000-0000-0000-0000-000000000000')).toBe(false)
  })

  it('rejects an expired token', async () => {
    const state = await service.issue(-1000)

    expect(await service.consume(state)).toBe(false)
  })

  it('rejects a malformed (non-uuid) token without touching the db', async () => {
    expect(await service.consume('not-a-uuid')).toBe(false)
  })
})
