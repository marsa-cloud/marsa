import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'
import { PaginatedOffsetSearchQuery } from '#src/utils/pagination/offset/paginated-offset-search.query.js'

class TestOffsetSearch extends PaginatedOffsetSearchQuery {}

describe('offset pagination query DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('defaults to limit 20, offset 0', () => {
    const q = new PaginatedOffsetQuery()
    expect(q.limit).toBe(20)
    expect(q.offset).toBe(0)
  })

  it('search query defaults pagination and leaves sort/filter/search unset', () => {
    const q = new TestOffsetSearch()
    expect(q.pagination.limit).toBe(20)
    expect(q.pagination.offset).toBe(0)
    expect(q.sort).toBeUndefined()
    expect(q.filter).toBeUndefined()
    expect(q.search).toBeUndefined()
  })
})
