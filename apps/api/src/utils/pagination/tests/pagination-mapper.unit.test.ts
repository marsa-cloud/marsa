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

  // The DTO validators reject these on the HTTP path; this covers a caller
  // building a query object directly, where nothing else stands in the way.
  it('raises a zero or negative limit to 1', () => {
    expect(mikroormPagination(query({ limit: 0, offset: 0 })).limit).toBe(1)
    expect(mikroormPagination(query({ limit: -5, offset: 0 })).limit).toBe(1)
  })

  it('floors a negative offset at 0', () => {
    expect(mikroormPagination(query({ limit: 10, offset: -1 })).offset).toBe(0)
  })

  it('falls back when limit or offset is NaN', () => {
    expect(mikroormPagination(query({ limit: Number.NaN, offset: Number.NaN }))).toEqual({
      limit: DEFAULT_PAGINATION_MAX_LIMIT,
      offset: 0,
    })
  })

  it('truncates fractional values', () => {
    expect(mikroormPagination(query({ limit: 10.9, offset: 5.7 }))).toEqual({
      limit: 10,
      offset: 5,
    })
  })

  it('never returns a limit below 1, even for a nonsensical max', () => {
    expect(mikroormPagination(query({ limit: 10, offset: 0 }), 0).limit).toBe(1)
  })
})
