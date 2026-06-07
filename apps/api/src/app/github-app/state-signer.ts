import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const DOMAIN_SEPARATOR = 'github-app-state-v1'

interface StatePayload {
  n: string
  exp: number
}

/**
 * Stateless CSRF guard for the Manifest round-trip (AgDR-0006).
 *
 * The `state` parameter travels to GitHub and back. We mint it as
 * `base64url(payload).base64url(hmac)` with `payload = { nonce, exp }`, signed
 * with a subkey derived from APP_SECRETS_ENCRYPTION_KEY (domain-separated from
 * encryption). On callback we verify the signature (constant-time) and that the
 * token is unexpired. This proves the callback came from a manifest we issued
 * and is fresh; binding it to an operator session is deferred to #22.
 */
@Injectable()
export class StateSigner {
  private readonly key: Buffer

  constructor() {
    const root = SecretCipherService.loadKey(process.env.APP_SECRETS_ENCRYPTION_KEY)
    this.key = createHmac('sha256', root).update(DOMAIN_SEPARATOR).digest()
  }

  sign(now: number = Date.now(), ttlMs: number = DEFAULT_TTL_MS): string {
    const payload: StatePayload = { n: randomNonce(), exp: now + ttlMs }
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return `${body}.${this.signature(body)}`
  }

  verify(state: string, now: number = Date.now()): boolean {
    const parts = state.split('.')
    if (parts.length !== 2) {
      return false
    }
    const [body, sig] = parts
    const expected = this.signature(body)
    if (!constantTimeEquals(sig, expected)) {
      return false
    }
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload
      return typeof payload.exp === 'number' && payload.exp > now
    } catch {
      return false
    }
  }

  private signature(body: string): string {
    return createHmac('sha256', this.key).update(body).digest('base64url')
  }
}

function randomNonce(): string {
  return randomBytes(16).toString('base64url')
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    return false
  }
  return timingSafeEqual(bufA, bufB)
}
