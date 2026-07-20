import { before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'
import {
  DEFAULT_PAGINATION_MAX_LIMIT,
  mikroormPagination,
} from '#src/utils/pagination/pagination-mapper.js'

const query = (plain: object): PaginatedOffsetQuery => plainToInstance(PaginatedOffsetQuery, plain)

describe('mikroormPagination', () => {
  before(() => TestBench.setupUnitTest())

  it('passes a valid limit/offset straight through', () => {
    expect(mikroormPagination(query({ limit: 25, offset: 50 }))).toEqual({ limit: 25, offset: 50 })
  })

  it('falls back to the max limit and offset 0 when the query is absent', () => {
    expect(mikroormPagination()).toEqual({ limit: DEFAULT_PAGINATION_MAX_LIMIT, offset: 0 })
    expect(mikroormPagination(null)).toEqual({ limit: DEFAULT_PAGINATION_MAX_LIMIT, offset: 0 })
  })

  // The DTO's @Max already rejects this at the pipe; the clamp is defence in
  // depth for callers constructing a query object directly.
  it('clamps a limit above the max', () => {
    expect(mikroormPagination(query({ limit: 500, offset: 0 })).limit).toBe(
      DEFAULT_PAGINATION_MAX_LIMIT,
    )
  })

  it('honours a caller-supplied max limit', () => {
    expect(mikroormPagination(query({ limit: 80, offset: 0 }), 10).limit).toBe(10)
  })

  it('does not raise a limit that is below the max', () => {
    expect(mikroormPagination(query({ limit: 5, offset: 0 }), 50).limit).toBe(5)
  })
})
