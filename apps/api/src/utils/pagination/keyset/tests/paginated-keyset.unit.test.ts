import { before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync, type ValidationError } from 'class-validator'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

const collect = (errors: ValidationError[]): string[] =>
  errors.flatMap((e) => [...Object.keys(e.constraints ?? {}), ...collect(e.children ?? [])])

const errorsFor = (instance: object): string[] =>
  collect(validateSync(instance, { whitelist: true, forbidNonWhitelisted: true }))

const transform = <T extends object>(cls: new () => T, plain: object): T =>
  plainToInstance(cls, plain, { enableImplicitConversion: false })

// Nothing redeclared: SearchQuery's members are concrete, so a use-case opts in
// only to what it needs. This is the shape an adopter is most likely to write.
class TestKeysetSearch extends PaginatedKeysetSearchQuery {}

describe('keyset pagination DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('coerces limit and leaves key untouched', () => {
    const q = transform(PaginatedKeysetQuery, { limit: '10', key: 'abc' })

    expect(q.limit).toBe(10)
    expect(q.key).toBe('abc')
    expect(errorsFor(q)).toEqual([])
  })

  it('accepts a structured or null key', () => {
    expect(errorsFor(transform(PaginatedKeysetQuery, { key: { id: '1' } }))).toEqual([])
    expect(errorsFor(transform(PaginatedKeysetQuery, { key: null }))).toEqual([])
  })

  it('treats limit as optional', () => {
    const q = transform(PaginatedKeysetQuery, {})

    expect(q.limit).toBeUndefined()
    expect(errorsFor(q)).toEqual([])
  })

  it('rejects a limit above the max', () => {
    expect(errorsFor(transform(PaginatedKeysetQuery, { limit: '500' }))).toContain('max')
  })

  it('rejects a non-positive limit', () => {
    expect(errorsFor(transform(PaginatedKeysetQuery, { limit: '0' }))).toContain('isPositive')
  })

  // The offset sibling validates its nested pagination; keyset must too.
  it('validates the nested pagination object', () => {
    const q = transform(TestKeysetSearch, { pagination: { limit: '5' } })

    expect(q.pagination).toBeInstanceOf(PaginatedKeysetQuery)
    expect(q.pagination?.limit).toBe(5)
    expect(errorsFor(q)).toEqual([])
  })

  it('surfaces nested pagination violations from the child error', () => {
    expect(errorsFor(transform(TestKeysetSearch, { pagination: { limit: '500' } }))).toContain('max')
  })

  it('treats the nested pagination object as optional', () => {
    const q = transform(TestKeysetSearch, {})

    expect(q.pagination).toBeUndefined()
    expect(errorsFor(q)).toEqual([])
  })

  it('wraps a page as items + a next key', () => {
    const page = new PaginatedKeysetResponse<number>([1, 2], new PaginatedKeysetResponseMeta(null))

    expect(page.items).toEqual([1, 2])
    expect(page.meta.next).toBeNull()
    expect(page.meta).toBeInstanceOf(PaginatedKeysetResponseMeta)
  })

  it('carries a structured next key on a non-final page', () => {
    const page = new PaginatedKeysetResponse<number>([1], new PaginatedKeysetResponseMeta({ id: '1' }))

    expect(page.meta.next).toEqual({ id: '1' })
  })
})
