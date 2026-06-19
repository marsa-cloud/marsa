import { type ConfigType, registerAs } from '@nestjs/config'

import { DEFAULT_AUTH_COOKIE_NAME } from '#src/config/env.config.js'

const SESSION_KEY_LENGTH = 32

function loadSessionKey(raw: string): Buffer {
  // Presence is guaranteed by the global env schema (AgDR-0020); only the
  // byte-length shape (base64 → 32 bytes) is checked here.
  const key = Buffer.from(raw, 'base64')
  if (key.length !== SESSION_KEY_LENGTH) {
    throw new Error(
      `AUTH_SESSION_SECRET_KEY must decode to ${SESSION_KEY_LENGTH} bytes (got ${key.length})`,
    )
  }
  return key
}

/**
 * Session-cookie config (namespace `auth`).
 *
 * Decodes `AUTH_SESSION_SECRET_KEY` (base64, 32 bytes) at boot, mirroring
 * `SecretCipherService.loadKey`'s fail-fast convention. Used to register
 * `@fastify/secure-session` (AgDR-0016) — no DB session table, so this is the
 * only secret the session mechanism needs.
 */
export const authConfig = registerAs('auth', () => ({
  sessionKey: loadSessionKey(process.env.AUTH_SESSION_SECRET_KEY ?? ''),
  cookieName: process.env.AUTH_COOKIE_NAME ?? DEFAULT_AUTH_COOKIE_NAME,
}))

export type AuthConfig = ConfigType<typeof authConfig>
