/** Inputs for minting a GitHub installation access token. */
export interface InstallationTokenParams {
  githubAppId: string
  privateKeyPem: string
  installationId: string
}

/** Raw GitHub App manifest-conversion response (snake_case, GitHub's shape). */
export interface GitHubManifestConversionResponse {
  id: number
  slug: string
  name: string
  html_url: string
  owner?: { login?: string } | null
  client_id: string
  client_secret: string
  webhook_secret: string
  pem: string
}

/** Normalised credentials returned by the GitHub App manifest conversion (camelCase, ours). */
export interface GitHubAppCredentials {
  id: number
  slug: string
  name: string
  htmlUrl: string
  ownerLogin: string | null
  clientId: string
  clientSecret: string
  webhookSecret: string
  pem: string
}

/** Inputs for exchanging a user-OAuth `code` for a GitHub user access token. */
export interface UserOAuthExchangeParams {
  clientId: string
  clientSecret: string
  code: string
}

/** GitHub's `GET /user` response, normalised to the fields Marsa persists. */
export interface GitHubUser {
  id: number
  login: string
}

/** Raw GitHub `POST /login/oauth/access_token` response (snake_case, GitHub's shape). */
export interface GitHubOAuthAccessTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}
