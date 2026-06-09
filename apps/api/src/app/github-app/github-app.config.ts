import { type ConfigType, registerAs } from '@nestjs/config'
import Joi from 'joi'

const WEBHOOK_PATH = '/api/v1/github-app/webhooks'
const REDIRECT_PATH = '/setup/github/callback'
const OAUTH_CALLBACK_PATH = '/auth/github/callback'

interface GitHubAppEnv {
  MARSA_WEB_URL: string
  MARSA_API_PUBLIC_URL: string
}

const schema = Joi.object<GitHubAppEnv, true>({
  MARSA_WEB_URL: Joi.string().uri().required(),
  MARSA_API_PUBLIC_URL: Joi.string().uri().required(),
})

/**
 * GitHub App provisioning config (namespace `githubApp`).
 *
 * Validates the install's two public-URL env vars with Joi at boot (fail-fast on
 * a missing or non-URI value) and derives the manifest webhook / redirect /
 * oauth-callback URLs. Injected via `@Inject(githubAppConfig.KEY)` through
 * `ConfigModule.forFeature`. A global env-validation schema and migrating the
 * other ad-hoc `process.env` reads are deferred — see AgDR-0008. Chart wiring of
 * these env vars is a marsa-charts follow-up (AgDR-0006).
 */
export const githubAppConfig = registerAs('githubApp', () => {
  const { error } = schema.validate({
    MARSA_WEB_URL: process.env.MARSA_WEB_URL,
    MARSA_API_PUBLIC_URL: process.env.MARSA_API_PUBLIC_URL,
  })
  if (error) {
    throw new Error(`Invalid github-app config: ${error.message}`)
  }

  // Validated above as required URIs; read the raw env directly since Joi's
  // returned `value` is loosely typed as `any`.
  const webUrl = stripTrailingSlash(process.env.MARSA_WEB_URL ?? '')
  const apiPublicUrl = stripTrailingSlash(process.env.MARSA_API_PUBLIC_URL ?? '')

  return {
    webUrl,
    apiPublicUrl,
    webhookUrl: `${apiPublicUrl}${WEBHOOK_PATH}`,
    redirectUrl: `${webUrl}${REDIRECT_PATH}`,
    oauthCallbackUrl: `${webUrl}${OAUTH_CALLBACK_PATH}`,
  }
})

export type GitHubAppConfig = ConfigType<typeof githubAppConfig>

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}
