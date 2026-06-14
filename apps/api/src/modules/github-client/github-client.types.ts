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
