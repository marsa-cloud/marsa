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
