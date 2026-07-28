import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { DEFAULT_PAGINATION_MAX_LIMIT } from '#src/utils/pagination/pagination-mapper.js'
import {
  SearchQuery,
  SortDirection,
  SortDirectionApiProperty,
  SortQuery,
} from '#src/utils/pagination/search.query.js'

class TestSort extends SortQuery {
  key = 'createdAt'
  order = SortDirection.DESC
}

// Narrows only `sort`; the other members are inherited untouched.
class TestSearch extends SearchQuery {
  declare sort?: TestSort[]
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

  it('a concrete SearchQuery accepts multiple sorts and leaves members opt-in', () => {
    const query = new TestSearch()
    query.sort = [new TestSort(), new TestSort()]

    expect(query.sort).toHaveLength(2)
    expect(query.filter).toBeUndefined()
    expect(query.search).toBeUndefined()
  })

  it('caps the page size', () => {
    expect(DEFAULT_PAGINATION_MAX_LIMIT).toBe(100)
  })
})
