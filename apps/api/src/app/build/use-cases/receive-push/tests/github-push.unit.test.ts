import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import {
  installationIdOf,
  readBranchPush,
} from '#src/app/build/use-cases/receive-push/github-push.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const SHA = 'b'.repeat(40)

const push = (overrides: Record<string, unknown> = {}) => ({
  ref: 'refs/heads/main',
  after: SHA,
  deleted: false,
  repository: { full_name: 'acme/shop' },
  installation: { id: 4242 },
  ...overrides,
})

describe('readBranchPush', () => {
  before(() => TestBench.setupUnitTest())

  it('reads a branch push', () => {
    expect(readBranchPush(push())).toEqual({
      installationId: '4242',
      repo: 'acme/shop',
      branch: 'main',
      commitSha: SHA,
    })
  })

  it('keeps slashes in the branch name', () => {
    expect(readBranchPush(push({ ref: 'refs/heads/feature/x' }))?.branch).toBe('feature/x')
  })

  it('ignores a tag push', () => {
    expect(readBranchPush(push({ ref: 'refs/tags/v1.0.0' }))).toBeNull()
  })

  it('ignores a branch deletion', () => {
    expect(readBranchPush(push({ deleted: true, after: '0'.repeat(40) }))).toBeNull()
  })

  it('ignores a payload without an installation', () => {
    expect(readBranchPush(push({ installation: undefined }))).toBeNull()
  })

  it('ignores a payload that is not an object', () => {
    expect(readBranchPush(null)).toBeNull()
  })
})

describe('installationIdOf', () => {
  before(() => TestBench.setupUnitTest())

  it('stringifies the numeric installation id', () => {
    expect(installationIdOf(push())).toBe('4242')
  })

  it('is null when the payload has none, like a ping from a fresh App', () => {
    expect(installationIdOf({ zen: 'hi' })).toBeNull()
  })
})
