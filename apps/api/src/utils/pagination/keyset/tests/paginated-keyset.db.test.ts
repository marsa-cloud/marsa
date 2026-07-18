import { after, before, describe, it } from 'node:test'
import { type FilterQuery, type QueryOrderMap } from '@mikro-orm/core'
import { expect } from 'expect'
import { DeploymentsModule } from '#src/app/deployments/deployments.module.js'
import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { buildKeysetPage, type KeysetPage } from '#src/utils/pagination/keyset/build-keyset-page.js'
import { decodeCursor } from '#src/utils/pagination/keyset/cursor.js'
import {
  type KeysetComparison,
  keysetComparison,
} from '#src/utils/pagination/keyset/keyset-comparison.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

// The two ORM-specific steps an adopting repo writes: translating the
// ORM-neutral descriptor into a MikroORM WHERE, and into its ORDER BY.
function keysetWhere(cmp: KeysetComparison): FilterQuery<App> {
  const op = cmp.operator === 'lt' ? '$lt' : '$gt'
  const sortValue = new Date(cmp.sortValue)
  return {
    $or: [
      { [cmp.sortField]: { [op]: sortValue } },
      { [cmp.sortField]: sortValue, [cmp.idField]: { [op]: cmp.id } },
    ],
  }
}

// Derived from the descriptor, never hand-written: keyset is only correct when
// ORDER BY matches the predicate exactly.
function keysetOrderBy(cmp: KeysetComparison): QueryOrderMap<App> {
  return Object.fromEntries(
    cmp.orderBy.map(([field, direction]) => [
      field,
      direction === SortDirection.ASC ? 'ASC' : 'DESC',
    ]),
  )
}

const SORT_FIELD = 'createdAt'
const ID_FIELD = 'uuid'
const ORDER = SortDirection.DESC
const toCursor = (app: App) => ({ sortValue: app.createdAt.toISOString(), id: app.uuid })

// Descriptor for the first page, where there is no cursor to seek past yet.
const firstPageOrderBy = keysetOrderBy(
  keysetComparison(SORT_FIELD, ID_FIELD, ORDER, { sortValue: '', id: '' }),
)

describe('keyset pagination over a real App query (db)', () => {
  let setup: TestSetup

  after(async () => {
    await setup.teardown()
  })

  before(async () => {
    setup = await TestBench.setupModuleTest(DeploymentsModule)
  })

  it('advances by cursor and stays stable across a mid-scan insert', async () => {
    const em = setup.entityManager
    const base = Date.now()
    for (let i = 0; i < 4; i++) {
      const app = new AppBuilder().withSlug(`app-${i}`).build()
      app.createdAt = new Date(base + i * 1000) // distinct -> deterministic DESC order
      em.persist(app)
    }
    await em.flush()

    const limit = 2

    // Page 1 — no cursor. Over-fetch limit+1 so buildKeysetPage can detect hasMore.
    const page1 = buildKeysetPage(
      await em.find(App, {}, { orderBy: firstPageOrderBy, limit: limit + 1 }),
      limit,
      toCursor,
    )
    expect(page1.items.map((a) => a.slug)).toEqual(['app-3', 'app-2'])
    expect(page1.meta.hasMore).toBe(true)

    // A row inserted AFTER page 1, newer than everything. Offset pagination would
    // shift page 2 and duplicate a row; keyset must ignore it.
    const intruder = new AppBuilder().withSlug('app-intruder').build()
    intruder.createdAt = new Date(base + 10_000)
    em.persist(intruder)
    await em.flush()

    const cmp = keysetComparison(
      SORT_FIELD,
      ID_FIELD,
      ORDER,
      decodeCursor(page1.meta.nextCursor as string),
    )
    const page2 = buildKeysetPage(
      await em.find(App, keysetWhere(cmp), {
        orderBy: keysetOrderBy(cmp),
        limit: limit + 1,
      }),
      limit,
      toCursor,
    )

    expect(page2.items.map((a) => a.slug)).toEqual(['app-1', 'app-0'])
    expect(page2.items.map((a) => a.slug)).not.toContain('app-intruder')
    expect(page2.items.map((a) => a.slug)).not.toContain('app-2')

    await em.nativeDelete(App, {})
  })

  // The compound (sortColumn, uuid) key exists ONLY because createdAt can tie —
  // v4 UUIDs are random, not time-sortable. This drives the page boundary INTO a
  // tie group so the predicate's second branch (sortField = V AND idField < id)
  // is the thing deciding the result. Without ties that branch never executes.
  it('never skips or repeats a row when the page boundary falls inside a tie', async () => {
    const em = setup.entityManager
    const tiedAt = new Date(Date.now())

    for (let i = 0; i < 3; i++) {
      const app = new AppBuilder().withSlug(`tie-${i}`).build()
      app.createdAt = tiedAt // all three share one timestamp
      em.persist(app)
    }
    for (let i = 0; i < 2; i++) {
      const app = new AppBuilder().withSlug(`old-${i}`).build()
      app.createdAt = new Date(tiedAt.getTime() - (i + 1) * 1000)
      em.persist(app)
    }
    await em.flush()

    // Expected DESC order: the tie group by uuid DESC, then the older rows.
    const all = await em.find(App, {}, { orderBy: firstPageOrderBy })
    const expectedOrder = all.map((a) => a.slug)
    const tieSlugs = all
      .filter((a) => a.createdAt.getTime() === tiedAt.getTime())
      .map((a) => a.slug)
    expect(tieSlugs).toHaveLength(3)

    // Walk every page with limit 2, so page 1 ends mid-tie-group.
    const limit = 2
    const seen: string[] = []
    let cursor: string | null = null

    for (let guard = 0; guard < 10; guard++) {
      const where: FilterQuery<App> = cursor
        ? keysetWhere(keysetComparison(SORT_FIELD, ID_FIELD, ORDER, decodeCursor(cursor)))
        : {}
      const orderBy = cursor
        ? keysetOrderBy(keysetComparison(SORT_FIELD, ID_FIELD, ORDER, decodeCursor(cursor)))
        : firstPageOrderBy

      // Annotated: `cursor` is reassigned from `page` below, so inference would
      // otherwise chase its own tail through the loop.
      const page: KeysetPage<App> = buildKeysetPage(
        await em.find(App, where, { orderBy, limit: limit + 1 }),
        limit,
        toCursor,
      )
      seen.push(...page.items.map((a: App) => a.slug))
      if (!page.meta.hasMore) break
      cursor = page.meta.nextCursor
    }

    // Every row exactly once, in order — no duplicate, no skip across the tie.
    expect(seen).toEqual(expectedOrder)
    expect(new Set(seen).size).toBe(5)

    await em.nativeDelete(App, {})
  })
})
