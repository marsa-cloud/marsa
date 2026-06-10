import { afterEach, before, describe, it } from 'node:test'

import { expect } from 'expect'

import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const KEY_A = Buffer.alloc(32, 7).toString('base64')
const KEY_B = Buffer.alloc(32, 9).toString('base64')

function withKey(keyB64: string | undefined): SecretCipherService {
  if (keyB64 === undefined) {
    delete process.env.APP_SECRETS_ENCRYPTION_KEY
  } else {
    process.env.APP_SECRETS_ENCRYPTION_KEY = keyB64
  }
  return new SecretCipherService()
}

describe('SecretCipherService', () => {
  const original = process.env.APP_SECRETS_ENCRYPTION_KEY

  before(() => TestBench.setupUnitTest())

  afterEach(() => {
    if (original === undefined) {
      delete process.env.APP_SECRETS_ENCRYPTION_KEY
    } else {
      process.env.APP_SECRETS_ENCRYPTION_KEY = original
    }
  })

  it('round-trips plaintext through encrypt/decrypt', () => {
    const cipher = withKey(KEY_A)
    const plaintext = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n'

    const token = cipher.encrypt(plaintext)

    expect(token).not.toContain('BEGIN PRIVATE KEY')
    expect(cipher.decrypt(token)).toBe(plaintext)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    const cipher = withKey(KEY_A)

    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'))
  })

  it('throws when the ciphertext is tampered with', () => {
    const cipher = withKey(KEY_A)
    const token = cipher.encrypt('secret')
    const bytes = Buffer.from(token, 'base64')
    bytes[bytes.length - 1] ^= 0x01

    expect(() => cipher.decrypt(bytes.toString('base64'))).toThrow(/authenticate/)
  })

  it('throws when decrypting with the wrong key', () => {
    const token = withKey(KEY_A).encrypt('secret')

    expect(() => withKey(KEY_B).decrypt(token)).toThrow(/authenticate/)
  })

  it('throws on a token that is too short', () => {


    expect(() => cipher.decrypt(Buffer.alloc(4).toString('base64'))).toThrow(/too short/)
  })

  it('fails fast when the key is missing', () => {
    expect(() => withKey(undefined)).toThrow(/not set/)
  })

  it('fails fast when the key is the wrong length', () => {
    expect(() => withKey(Buffer.alloc(16, 1).toString('base64'))).toThrow(/32 bytes/)
  })
})
