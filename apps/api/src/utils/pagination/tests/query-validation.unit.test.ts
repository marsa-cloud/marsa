import { before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync, type ValidationError } from 'class-validator'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedKeysetQuery } from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'
import { PaginatedOffsetSearchQuery } from '#src/utils/pagination/offset/paginated-offset-search.query.js'

// Mirrors the global ValidationPipe in entrypoints/api.ts. `enableImplicitConversion`
// is deliberately absent there, which is why the DTOs carry @Type(() => Number) —
// these tests fail if that decorator is ever dropped.
const transform = <T extends object>(cls: new () => T, plain: object): T =>
  plainToInstance(cls, plain, { enableImplicitConversion: false })

// @ValidateNested reports a nested violation in `children` with no top-level
// `constraints`, so collecting failures means walking the tree.
const collect = (errors: ValidationError[]): string[] =>
  errors.flatMap((e) => [...Object.keys(e.constraints ?? {}), ...collect(e.children ?? [])])

const errorsFor = (instance: object): string[] =>
  collect(validateSync(instance, { whitelist: true, forbidNonWhitelisted: true }))

class TestOffsetSearch extends PaginatedOffsetSearchQuery {}

describe('pagination query DTOs through the validation pipeline', () => {
  before(() => TestBench.setupUnitTest())

  it('coerces string query params to numbers', () => {
    const q = transform(PaginatedOffsetQuery, { limit: '50', offset: '100' })

    expect(q.limit).toBe(50)
    expect(q.offset).toBe(100)
    expect(errorsFor(q)).toEqual([])
  })

  it('applies defaults when params are absent', () => {
    const q = transform(PaginatedOffsetQuery, {})

    expect(q.limit).toBe(20)
    expect(q.offset).toBe(0)
    expect(errorsFor(q)).toEqual([])
  })

  it('rejects a limit above MAX_LIMIT', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { limit: '500' }))).toContain('max')
  })

  it('rejects a limit below MIN_LIMIT', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { limit: '0' }))).toContain('min')
  })

  it('rejects a negative offset', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { offset: '-1' }))).toContain('min')
  })

  it('rejects a non-integer limit', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { limit: '2.5' }))).toContain('isInt')
  })

  it('validates a nested pagination object from qs-style params', () => {
    const q = transform(TestOffsetSearch, { pagination: { limit: '5', offset: '10' } })

    expect(q.pagination).toBeInstanceOf(PaginatedOffsetQuery)
    expect(q.pagination.limit).toBe(5)
    expect(q.pagination.offset).toBe(10)
    expect(errorsFor(q)).toEqual([])
  })

  it('surfaces nested pagination violations from the child error', () => {
    const q = transform(TestOffsetSearch, { pagination: { limit: '500' } })

    expect(errorsFor(q)).toContain('max')
  })

  it('keeps the default nested pagination when the key is absent', () => {
    const q = transform(TestOffsetSearch, {})

    expect(q.pagination.limit).toBe(20)
    expect(q.pagination.offset).toBe(0)
  })

  it('coerces and validates the keyset query, keeping the cursor a string', () => {
    const q = transform(PaginatedKeysetQuery, { limit: '10', cursor: 'abc' })

    expect(q.limit).toBe(10)
    expect(q.cursor).toBe('abc')
    expect(errorsFor(q)).toEqual([])
  })

  it('rejects a non-string keyset cursor', () => {
    expect(errorsFor(transform(PaginatedKeysetQuery, { cursor: 42 }))).toContain('isString')
  })
})
