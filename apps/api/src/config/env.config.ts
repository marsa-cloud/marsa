import Joi from 'joi'

/** Used by `entrypoints/api.ts` when `AUTH_COOKIE_NAME` is unset. */
export const DEFAULT_AUTH_COOKIE_NAME = 'marsa_session'

const requiredOnKubernetes = <T extends Joi.Schema>(schema: T): T =>
  schema.when('MARSA_RUNTIME', { is: 'kubernetes', then: Joi.required() }) as T

/**
 * Single Joi schema validating every env var the api reads (AgDR-0020),
 * registered once via `ConfigModule.forRoot({ validationSchema })`. Feature-local
 * `registerAs()` slices (`authConfig`, `githubAppConfig`) read already-validated
 * `process.env` — they no longer run their own Joi check.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  MARSA_RUNTIME: Joi.string().valid('kubernetes', 'mock').default('kubernetes'),
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
  // Supplied by the chart from the downward API, never set by hand: it must equal the pod's real
  // namespace or the RoleBindings it writes are denied by the admission policy. Default is dev-only.
  MARSA_API_NAMESPACE: Joi.string().hostname().default('marsa'),
  // A volume cannot change storage class in place, so a fresh install must be able to pick
  // another backend on day one (#210).
  MARSA_DATABASE_STORAGE_CLASS: Joi.string().default('local-path'),
  // Public pull host (`registry.<domain>`, no scheme) and the in-cluster url pushes go to (#78).
  MARSA_REGISTRY_HOST: requiredOnKubernetes(Joi.string().hostname()),
  MARSA_REGISTRY_URL: requiredOnKubernetes(Joi.string().uri({ scheme: ['http', 'https'] })),
  MARSA_REGISTRY_PUSH_PASSWORD: requiredOnKubernetes(Joi.string()),
  MARSA_REGISTRY_PULL_PASSWORD: requiredOnKubernetes(Joi.string()),
  VERSION: Joi.string().default('0.0.0'),
  COMMIT: Joi.string().optional(),
})
