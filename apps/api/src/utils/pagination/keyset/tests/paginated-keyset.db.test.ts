import { after, before, describe, it } from 'node:test'
import { type FilterQuery } from '@mikro-orm/core'
import { expect } from 'expect'
import { DeploymentsModule } from '#src/app/deployments/deployments.module.js'
import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { decodeCursor, encodeCursor } from '#src/utils/pagination/keyset/cursor.js'
import {
  type KeysetComparison,
  keysetComparison,
} from '#src/utils/pagination/keyset/keyset-comparison.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

// The single ORM-specific step an adopting repo writes: descriptor -> MikroORM $or.
function keysetWhere(cmp: KeysetComparison): FilterQuery<App> {
  const sortValue = new Date(cmp.sortValue)
  return {
    $or: [
      { [cmp.sortField]: { [cmp.operator]: sortValue } },
      { [cmp.sortField]: sortValue, [cmp.idField]: { [cmp.operator]: cmp.id } },
    ],
  }
}

describe('keyset pagination over a real App query (db)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupModuleTest(DeploymentsModule)
    const base = Date.now()
    for (let i = 0; i < 4; i++) {
      const app = new AppBuilder().withSlug(`app-${i}`).build()
      app.createdAt = new Date(base + i * 1000) // distinct timestamps -> deterministic DESC order
      setup.entityManager.persist(app)
    }
    await setup.entityManager.flush()
  })

  after(async () => {
    await setup.teardown()
  })

  it('advances by cursor and stays stable across a mid-scan insert', async () => {
    const em = setup.entityManager
    const limit = 2
    const orderBy = { createdAt: 'DESC', uuid: 'DESC' } as const

    // Page 1 — no cursor. Over-fetch limit+1 to detect hasMore.
    const page1 = await em.find(App, {}, { orderBy, limit: limit + 1 })
    const page1Items = page1.slice(0, limit)
    expect(page1Items.map((a) => a.slug)).toEqual(['app-3', 'app-2'])
    expect(page1.length > limit).toBe(true)

    const last = page1Items[limit - 1]
    const cursor = encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.uuid })

    // A row inserted AFTER page 1, newer than everything. Offset pagination would
    // shift page 2 and duplicate a row; keyset (seek past the cursor) must ignore it.
    const intruder = new AppBuilder().withSlug('app-intruder').build()
    intruder.createdAt = new Date(Date.now() + 10_000)
    em.persist(intruder)
    await em.flush()

    // Page 2 — seek past the cursor.
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.DESC, decodeCursor(cursor))
    const page2 = await em.find(App, keysetWhere(cmp), { orderBy, limit: limit + 1 })
    const page2Slugs = page2.slice(0, limit).map((a) => a.slug)

    expect(page2Slugs).toEqual(['app-1', 'app-0'])
    expect(page2Slugs).not.toContain('app-intruder')
    expect(page2Slugs).not.toContain('app-2')
  })
})
