import { type ConfigType, registerAs } from '@nestjs/config'

import { stripTrailingSlash } from '#src/utils/strip-trailing-slash.js'

const WEBHOOK_PATH = '/api/v1/github-app/webhooks'
const REDIRECT_PATH = '/setup/github/callback'
const OAUTH_CALLBACK_PATH = '/auth/github/callback'

/**
 * GitHub App provisioning config (namespace `githubApp`).
 *
 * Derives the manifest webhook / redirect / oauth-callback URLs from the
 * install's two public-URL env vars — presence and URI shape are guaranteed by
 * the global env schema (AgDR-0020), so no validation happens here. Injected
 * via `@Inject(githubAppConfig.KEY)` through `ConfigModule.forFeature`. Chart
 * wiring of these env vars is a marsa-charts follow-up (AgDR-0006).
 */
export const githubAppConfig = registerAs('githubApp', () => {
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
