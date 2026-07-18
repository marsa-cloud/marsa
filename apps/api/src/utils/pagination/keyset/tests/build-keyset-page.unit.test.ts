import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { buildKeysetPage } from '#src/utils/pagination/keyset/build-keyset-page.js'
import { decodeCursor } from '#src/utils/pagination/keyset/cursor.js'

interface Row {
  readonly id: string
  readonly at: string
}

const row = (n: number): Row => ({ id: `id-${n}`, at: `2026-07-1${n}T00:00:00.000Z` })
const toCursor = (r: Row) => ({ sortValue: r.at, id: r.id })

describe('buildKeysetPage', () => {
  before(() => TestBench.setupUnitTest())

  it('drops the over-fetched row and reports hasMore', () => {
    const page = buildKeysetPage([row(1), row(2), row(3)], 2, toCursor)

    expect(page.items.map((r) => r.id)).toEqual(['id-1', 'id-2'])
    expect(page.meta.hasMore).toBe(true)
    expect(page.meta.limit).toBe(2)
  })

  it('builds nextCursor from the last KEPT row, not the last fetched row', () => {
    const page = buildKeysetPage([row(1), row(2), row(3)], 2, toCursor)

    // id-3 was fetched only to detect hasMore; seeking past it would skip it.
    expect(decodeCursor(page.meta.nextCursor as string)).toEqual(toCursor(row(2)))
  })

  it('reports the last page when the over-fetch comes back short', () => {
    const page = buildKeysetPage([row(1), row(2)], 2, toCursor)

    expect(page.items.map((r) => r.id)).toEqual(['id-1', 'id-2'])
    expect(page.meta.hasMore).toBe(false)
    expect(page.meta.nextCursor).toBeNull()
  })

  it('handles an empty result set', () => {
    const page = buildKeysetPage([], 2, toCursor)

    expect(page.items).toEqual([])
    expect(page.meta.hasMore).toBe(false)
    expect(page.meta.nextCursor).toBeNull()
  })
})
