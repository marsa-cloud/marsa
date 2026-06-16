import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { authConfig } from '#src/app/auth/auth.config.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('authConfig', () => {
  before(() => TestBench.setupUnitTest())

  it('decodes a valid base64 session key into a 32-byte buffer', () => {
    const config = authConfig()

    expect(Buffer.isBuffer(config.sessionKey)).toBe(true)
    expect(config.sessionKey.length).toBe(32)
  })

  it('fails fast when AUTH_SESSION_SECRET_KEY is missing', () => {
    const original = process.env.AUTH_SESSION_SECRET_KEY
    delete process.env.AUTH_SESSION_SECRET_KEY
    try {
      expect(() => authConfig()).toThrow(/AUTH_SESSION_SECRET_KEY/)
    } finally {
      process.env.AUTH_SESSION_SECRET_KEY = original
    }
  })

  it('fails fast when the key does not decode to 32 bytes', () => {
    const original = process.env.AUTH_SESSION_SECRET_KEY
    process.env.AUTH_SESSION_SECRET_KEY = Buffer.from('too-short').toString('base64')
    try {
      expect(() => authConfig()).toThrow(/32 bytes/)
    } finally {
      process.env.AUTH_SESSION_SECRET_KEY = original
    }
  })
})
