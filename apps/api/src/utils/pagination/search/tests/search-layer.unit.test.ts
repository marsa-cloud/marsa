import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { DEFAULT_LIMIT, MAX_LIMIT, MIN_LIMIT } from '#src/utils/pagination/pagination.constants.js'
import { SortQuery } from '#src/utils/pagination/search/sort.query.js'
import {
  SortDirection,
  SortDirectionApiProperty,
} from '#src/utils/pagination/search/sort-direction.js'

class TestSort extends SortQuery {
  key = 'createdAt'
  order = SortDirection.DESC
}

describe('pagination search layer', () => {
  before(() => TestBench.setupUnitTest())

  it('exposes asc/desc string enum values', () => {
    expect(SortDirection.ASC).toBe('asc')
    expect(SortDirection.DESC).toBe('desc')
  })

  it('SortDirectionApiProperty returns a property decorator', () => {
    expect(typeof SortDirectionApiProperty()).toBe('function')
  })

  it('a concrete SortQuery carries key + order', () => {
    const sort = new TestSort()
    expect(sort.key).toBe('createdAt')
    expect(sort.order).toBe(SortDirection.DESC)
  })

  it('has sane limit bounds', () => {
    expect(MIN_LIMIT).toBeLessThan(DEFAULT_LIMIT)
    expect(DEFAULT_LIMIT).toBeLessThanOrEqual(MAX_LIMIT)
  })
})
