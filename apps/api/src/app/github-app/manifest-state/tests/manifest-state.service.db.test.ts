import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import { ManifestStateModule } from '#src/app/github-app/manifest-state/manifest-state.module.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

// The service commits (issue/consume must outlive a single request), so its rows
// are wiped by the TRUNCATE in `setup.teardown()`, not by transaction rollback.
describe('ManifestStateService (db)', () => {
  let setup: TestSetup
  let service: ManifestStateService

  before(async () => {
    setup = await TestBench.setupModuleTest(ManifestStateModule)
    service = setup.testModule.get(ManifestStateService)
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
    expect(await service.consume('not-a-uuid' as ManifestStateUuid)).toBe(false)
  })
})
