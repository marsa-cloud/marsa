import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { namespaceOf } from '#src/modules/runtime/adapters/kubernetes/environment/namespace-name.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import type { Uuid } from '#src/utils/uuid.js'

const ref = (projectSlug: string, environmentSlug: string) => ({
  project: { slug: projectSlug },
  environment: {
    uuid: '0190c3c0-0000-7000-8000-000000000001' as Uuid<'Environment'>,
    slug: environmentSlug,
  },
})

describe('namespaceOf', () => {
  before(() => TestBench.setupUnitTest())

  it('joins the project and environment slugs', () => {
    expect(namespaceOf(ref('demo', 'dev'))).toBe('demo-dev')
  })

  it('fits the longest allowed slugs inside a 63-char DNS label', () => {
    expect(namespaceOf(ref('p'.repeat(30), 'e'.repeat(32)))).toHaveLength(63)
  })
})
