import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'

import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { OAuthStateModule } from '#src/app/auth/oauth-state.module.js'
import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('OAuthStateService (db)', () => {
  let setup: TestSetup
  let service: OAuthStateService

  before(async () => {
    setup = await TestBench.setupModuleTest(OAuthStateModule)
    service = setup.testModule.get(OAuthStateService)
  })

  after(async () => {
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
    expect(await service.consume('not-a-uuid' as OAuthStateUuid)).toBe(false)
  })
})
