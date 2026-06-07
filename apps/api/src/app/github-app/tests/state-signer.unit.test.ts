import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { StateSigner } from '#src/app/github-app/state-signer.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('StateSigner', () => {
  before(() => TestBench.setupUnitTest())

  it('verifies a freshly signed state', () => {
    const signer = new StateSigner()

    expect(signer.verify(signer.sign())).toBe(true)
  })

  it('rejects an expired state', () => {
    const signer = new StateSigner()
    const now = 1_000_000

    const state = signer.sign(now, 1000)

    expect(signer.verify(state, now + 2000)).toBe(false)
  })

  it('rejects a tampered payload', () => {
    const signer = new StateSigner()
    const sig = signer.sign().split('.')[1]
    const forged = Buffer.from('{"n":"x","exp":9999999999999}').toString('base64url')

    expect(signer.verify(`${forged}.${sig}`)).toBe(false)
  })

  it('rejects malformed states', () => {
    const signer = new StateSigner()

    expect(signer.verify('not-valid')).toBe(false)
    expect(signer.verify('a.b.c')).toBe(false)
  })
})
