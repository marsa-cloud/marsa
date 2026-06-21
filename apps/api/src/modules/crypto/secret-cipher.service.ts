import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Authenticated encryption for secrets at rest (AgDR-0006).
 *
 * AES-256-GCM via Node's built-in `crypto`. The stored token is
 * base64(`iv(12) ‖ authTag(16) ‖ ciphertext`). GCM's auth tag means a wrong
 * key or any tampering throws on decrypt rather than returning garbage.
 *
 * Key: 32 bytes, base64-encoded in `APP_SECRETS_ENCRYPTION_KEY`. Presence is
 * guaranteed by the global env schema (AgDR-0020); the service still fails
 * fast at construction if the decoded key is the wrong length.
 */
@Injectable()
export class SecretCipherService {
  private readonly key: Buffer

  constructor(config: ConfigService) {
    this.key = SecretCipherService.loadKey(config.getOrThrow('APP_SECRETS_ENCRYPTION_KEY'))
  }

  static loadKey(raw: string): Buffer {
    const key = Buffer.from(raw, 'base64')
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `APP_SECRETS_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length})`,
      )
    }
    return key
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH })
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
  }

  decrypt(token: string): string {
    const data = Buffer.from(token, 'base64')
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('ciphertext token is too short')
    }
    const iv = data.subarray(0, IV_LENGTH)
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }
}
