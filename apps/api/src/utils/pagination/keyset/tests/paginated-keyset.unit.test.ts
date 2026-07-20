import { before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import {
  KeysetDirection,
  KeysetDirectionApiProperty,
} from '#src/utils/pagination/keyset/keyset-direction.js'
import { PaginatedKeysetQuery } from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import type {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

class TestKeysetQuery extends PaginatedKeysetQuery {
  key?: string | object | null
}

describe('keyset pagination DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('exposes next/prev direction values', () => {
    expect(KeysetDirection.NEXT).toBe('next')
    expect(KeysetDirection.PREV).toBe('prev')
  })

  it('KeysetDirectionApiProperty returns a property decorator', () => {
    expect(typeof KeysetDirectionApiProperty()).toBe('function')
  })

  it('coerces limit and leaves key untouched', () => {
    const q = plainToInstance(
      TestKeysetQuery,
      { limit: '10', key: 'abc' },
      { enableImplicitConversion: false },
    )

    expect(q.limit).toBe(10)
    expect(q.key).toBe('abc')
    expect(validateSync(q)).toEqual([])
  })

  it('treats limit as optional', () => {
    const q = plainToInstance(TestKeysetQuery, {}, { enableImplicitConversion: false })

    expect(q.limit).toBeUndefined()
    expect(validateSync(q)).toEqual([])
  })

  it('rejects a limit above the max', () => {
    const q = plainToInstance(TestKeysetQuery, { limit: '500' }, { enableImplicitConversion: false })

    expect(Object.keys(validateSync(q)[0]?.constraints ?? {})).toContain('max')
  })

  it('accepts a structured or null key in the response meta', () => {
    const forward: PaginatedKeysetResponseMeta = { next: { id: '1' }, prev: null }
    const last: PaginatedKeysetResponseMeta = { next: null }
    const page: PaginatedKeysetResponse = { items: [1, 2], meta: last }

    expect(forward.next).toEqual({ id: '1' })
    expect(last.next).toBeNull()
    expect(page.items).toEqual([1, 2])
  })
})
