import { type ConfigType, registerAs } from '@nestjs/config'
import Joi from 'joi'

const SESSION_KEY_LENGTH = 32

interface AuthEnv {
  AUTH_SESSION_SECRET_KEY: string
}

const schema = Joi.object<AuthEnv, true>({
  AUTH_SESSION_SECRET_KEY: Joi.string().required(),
})

function loadSessionKey(raw: string | undefined): Buffer {
  const { error } = schema.validate({ AUTH_SESSION_SECRET_KEY: raw })
  if (error) {
    throw new Error(`Invalid auth config: ${error.message}`)
  }

  // Validated above as present; read directly since Joi's returned `value` is loosely typed.
  const key = Buffer.from(raw ?? '', 'base64')
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
 * Validates `AUTH_SESSION_SECRET_KEY` (base64, 32 bytes) at boot, mirroring
 * `SecretCipherService.loadKey`'s fail-fast convention. Used to register
 * `@fastify/secure-session` (AgDR-0016) — no DB session table, so this is the
 * only secret the session mechanism needs.
 */
export const authConfig = registerAs('auth', () => ({
  sessionKey: loadSessionKey(process.env.AUTH_SESSION_SECRET_KEY),
}))

export type AuthConfig = ConfigType<typeof authConfig>
