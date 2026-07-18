import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { keysetComparison } from '#src/utils/pagination/keyset/keyset-comparison.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

describe('keysetComparison', () => {
  before(() => TestBench.setupUnitTest())

  it('DESC seeks past the cursor with lt, ordering both columns DESC', () => {
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.DESC, {
      sortValue: 'v',
      id: 'i',
    })

    expect(cmp).toEqual({
      sortField: 'createdAt',
      idField: 'uuid',
      operator: 'lt',
      sortValue: 'v',
      id: 'i',
      orderBy: [
        ['createdAt', SortDirection.DESC],
        ['uuid', SortDirection.DESC],
      ],
    })
  })

  it('ASC seeks past the cursor with gt, ordering both columns ASC', () => {
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.ASC, {
      sortValue: 'v',
      id: 'i',
    })

    expect(cmp.operator).toBe('gt')
    expect(cmp.orderBy).toEqual([
      ['createdAt', SortDirection.ASC],
      ['uuid', SortDirection.ASC],
    ])
  })

  it('spells the operator ORM-neutrally, not in a query dialect', () => {
    const desc = keysetComparison('createdAt', 'uuid', SortDirection.DESC, {
      sortValue: 'v',
      id: 'i',
    })

    // Guards the ORM-agnostic seam: a Mongo/MikroORM-flavoured `$lt` here would
    // leak query-language dialect into the one type meant to be portable.
    expect(desc.operator).not.toMatch(/^\$/)
  })

  it('orders the tiebreaker after the sort column', () => {
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.DESC, {
      sortValue: 'v',
      id: 'i',
    })

    // The tiebreaker must come second — leading with it would sort by a random
    // v4 uuid and make the compound predicate meaningless.
    expect(cmp.orderBy.map(([field]) => field)).toEqual(['createdAt', 'uuid'])
  })
})
