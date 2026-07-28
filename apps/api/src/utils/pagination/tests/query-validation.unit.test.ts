import { before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync, type ValidationError } from 'class-validator'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import {
  PaginatedOffsetQuery,
  PaginatedOffsetSearchQuery,
} from '#src/utils/pagination/offset/paginated-offset.query.js'

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

// Redeclares nothing. SearchQuery's members are concrete precisely so this
// shape works: when they were abstract, a subclass had to redeclare them and an
// undecorated redeclaration tripped forbidNonWhitelisted, 400-ing every request
// once the app was bootstrapped. The clean run below is the regression guard.
class TestOffsetSearch extends PaginatedOffsetSearchQuery {}

describe('pagination query DTOs through the validation pipeline', () => {
  before(() => TestBench.setupUnitTest())

  it('coerces string query params to numbers', () => {
    const q = transform(PaginatedOffsetQuery, { limit: '50', offset: '100' })

    expect(q.limit).toBe(50)
    expect(q.offset).toBe(100)
    expect(errorsFor(q)).toEqual([])
  })

  it('requires limit and offset rather than defaulting them', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, {}))).toContain('isInt')
  })

  it('rejects a limit above the max', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { limit: '500', offset: '0' }))).toContain(
      'max',
    )
  })

  it('rejects a non-positive limit', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { limit: '0', offset: '0' }))).toContain(
      'isPositive',
    )
  })

  it('rejects a negative offset', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { limit: '10', offset: '-1' }))).toContain(
      'min',
    )
  })

  it('rejects a non-integer limit', () => {
    expect(errorsFor(transform(PaginatedOffsetQuery, { limit: '2.5', offset: '0' }))).toContain(
      'isInt',
    )
  })

  it('validates a nested pagination object from qs-style params', () => {
    const q = transform(TestOffsetSearch, { pagination: { limit: '5', offset: '10' } })

    expect(q.pagination).toBeInstanceOf(PaginatedOffsetQuery)
    expect(q.pagination?.limit).toBe(5)
    expect(q.pagination?.offset).toBe(10)
    expect(errorsFor(q)).toEqual([])
  })

  it('surfaces nested pagination violations from the child error', () => {
    const q = transform(TestOffsetSearch, { pagination: { limit: '500', offset: '0' } })

    expect(errorsFor(q)).toContain('max')
  })

  it('treats the nested pagination object as optional', () => {
    const q = transform(TestOffsetSearch, {})

    expect(q.pagination).toBeUndefined()
    expect(errorsFor(q)).toEqual([])
  })
})
