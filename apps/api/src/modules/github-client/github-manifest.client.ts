import { Injectable } from '@nestjs/common'

import { GITHUB_API } from '#src/modules/github-client/github-client.constants.js'
import type {
  GitHubAppCredentials,
  GitHubManifestConversionResponse,
} from '#src/modules/github-client/github-client.types.js'

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

    const data = (await response.json()) as GitHubManifestConversionResponse
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
