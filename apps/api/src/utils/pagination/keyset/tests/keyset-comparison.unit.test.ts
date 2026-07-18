import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { keysetComparison } from '#src/utils/pagination/keyset/keyset-comparison.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

describe('keysetComparison', () => {
  before(() => TestBench.setupUnitTest())

  it('DESC seeks past the cursor with $lt', () => {
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.DESC, {
      sortValue: 'v',
      id: 'i',
    })
    expect(cmp).toEqual({
      sortField: 'createdAt',
      idField: 'uuid',
      operator: '$lt',
      sortValue: 'v',
      id: 'i',
    })
  })

  it('ASC seeks past the cursor with $gt', () => {
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.ASC, {
      sortValue: 'v',
      id: 'i',
    })
    expect(cmp.operator).toBe('$gt')
  })
})
