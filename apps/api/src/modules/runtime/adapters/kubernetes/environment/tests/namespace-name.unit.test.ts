import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { namespaceOf } from '#src/modules/runtime/adapters/kubernetes/environment/namespace-name.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('namespaceOf', () => {
  before(() => TestBench.setupUnitTest())

  it('joins the project and environment slugs', () => {
    expect(namespaceOf({ projectSlug: 'demo', environmentSlug: 'dev' })).toBe('demo-dev')
  })

  it('fits the longest allowed slugs inside a 63-char DNS label', () => {
    expect(
      namespaceOf({ projectSlug: 'p'.repeat(30), environmentSlug: 'e'.repeat(32) }),
    ).toHaveLength(63)
  })
})
