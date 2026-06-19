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

  it('falls back to the default cookie name when AUTH_COOKIE_NAME is unset', () => {
    const config = authConfig()

    expect(config.cookieName).toBe('marsa_session')
  })

  it('fails fast when the key does not decode to 32 bytes', () => {
    // Presence of AUTH_SESSION_SECRET_KEY is guaranteed by the global env schema
    // (AgDR-0020); this only proves the still-local byte-length check still fires.
    const original = process.env.AUTH_SESSION_SECRET_KEY
    process.env.AUTH_SESSION_SECRET_KEY = Buffer.from('too-short').toString('base64')
    try {
      expect(() => authConfig()).toThrow(/32 bytes/)
    } finally {
      process.env.AUTH_SESSION_SECRET_KEY = original
    }
  })
})
