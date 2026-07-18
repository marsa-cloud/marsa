import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedKeysetQuery } from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import { PaginatedKeysetResponse } from '#src/utils/pagination/keyset/paginated-keyset.response.js'
import { PaginatedKeysetResponseMeta } from '#src/utils/pagination/keyset/paginated-keyset-response-meta.js'
import { PaginatedKeysetSearchQuery } from '#src/utils/pagination/keyset/paginated-keyset-search.query.js'

class TestKeysetSearch extends PaginatedKeysetSearchQuery {}

describe('keyset pagination DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('query defaults to limit 20, undefined cursor', () => {
    const q = new PaginatedKeysetQuery()
    expect(q.limit).toBe(20)
    expect(q.cursor).toBeUndefined()
  })

  it('search query defaults pagination', () => {
    const q = new TestKeysetSearch()
    expect(q.pagination.limit).toBe(20)
  })

  it('meta captures nextCursor/hasMore/limit', () => {
    const meta = new PaginatedKeysetResponseMeta('cur', true, 20)
    expect(meta.nextCursor).toBe('cur')
    expect(meta.hasMore).toBe(true)
    expect(meta.limit).toBe(20)
  })

  it('meta allows a null nextCursor', () => {
    const meta = new PaginatedKeysetResponseMeta(null, false, 20)
    expect(meta.nextCursor).toBeNull()
    expect(meta.hasMore).toBe(false)
  })

  it('response wraps items + meta', () => {
    const meta = new PaginatedKeysetResponseMeta(null, false, 20)
    const res = new PaginatedKeysetResponse<number>([1, 2], meta)
    expect(res.items).toEqual([1, 2])
    expect(res.meta).toBe(meta)
  })
})
