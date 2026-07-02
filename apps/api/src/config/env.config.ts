import Joi from 'joi'

/** Used by `entrypoints/api.ts` when `AUTH_COOKIE_NAME` is unset. */
export const DEFAULT_AUTH_COOKIE_NAME = 'marsa_session'

/**
 * Single Joi schema validating every env var the api reads (AgDR-0020),
 * registered once via `ConfigModule.forRoot({ validationSchema })`. Feature-local
 * `registerAs()` slices (`authConfig`, `githubAppConfig`) read already-validated
 * `process.env` — they no longer run their own Joi check.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  DB_NAME: Joi.string().required(),
  APP_SECRETS_ENCRYPTION_KEY: Joi.string().required(),
  AUTH_SESSION_SECRET_KEY: Joi.string().required(),
  AUTH_COOKIE_NAME: Joi.string().default(DEFAULT_AUTH_COOKIE_NAME),
  MARSA_WEB_URL: Joi.string().uri().required(),
  MARSA_API_PUBLIC_URL: Joi.string().uri().required(),
  // Base domain operator apps are exposed under: `<slug>.<MARSA_BASE_DOMAIN>`
  // (e.g. `demo.marsa.cc`). Bare host, no scheme. Used to render the
  // Traefik IngressRoute Host rule for deployed apps (#98).
  MARSA_BASE_DOMAIN: Joi.string().hostname().required(),
  VERSION: Joi.string().default('0.0.0'),
  COMMIT: Joi.string().optional(),
})
