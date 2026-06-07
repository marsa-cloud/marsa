import { Injectable } from '@nestjs/common'

const GITHUB_API = 'https://api.github.com'

/** Normalised credentials returned by the manifest conversion. */
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

interface ConversionResponse {
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

/**
 * Talks to GitHub's manifest conversion endpoint. Injectable so tests provide a
 * fake without hitting the network. One unauthenticated POST — the `code`
 * itself is the credential and expires ~1h after issue (AgDR-0006).
 */
@Injectable()
export class GitHubManifestClient {
  async convertManifest(code: string): Promise<GitHubAppCredentials> {
    const response = await fetch(
      `${GITHUB_API}/app-manifests/${encodeURIComponent(code)}/conversions`,
      {
        method: 'POST',
        headers: { Accept: 'application/vnd.github+json' },
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`GitHub manifest conversion failed: ${response.status} ${body}`.trim())
    }

    const data = (await response.json()) as ConversionResponse
    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      htmlUrl: data.html_url,
      ownerLogin: data.owner?.login ?? null,
      clientId: data.client_id,
      clientSecret: data.client_secret,
      webhookSecret: data.webhook_secret,
      pem: data.pem,
    }
  }
}
