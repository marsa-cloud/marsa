import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('namespaceOf', () => {
  before(() => TestBench.setupUnitTest())

  it('joins the project and environment slugs', () => {
    expect(namespaceOf({ slug: 'demo' }, { slug: 'dev' })).toBe('demo-dev')
  })

  it('fits the longest allowed slugs inside a 63-char DNS label', () => {
    expect(namespaceOf({ slug: 'p'.repeat(30) }, { slug: 'e'.repeat(32) })).toHaveLength(63)
  })
})
