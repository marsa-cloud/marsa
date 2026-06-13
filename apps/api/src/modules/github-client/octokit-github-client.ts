import { createHash } from 'node:crypto'

import { Injectable, Logger, Optional } from '@nestjs/common'
import { createAppAuth } from '@octokit/auth-app'

import { GITHUB_API } from '#src/modules/github-client/github-client.constants.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import type {
  AppAuthFactory,
  GitHubAppCredentials,
  GitHubManifestConversionResponse,
  InstallationTokenParams,
} from '#src/modules/github-client/github-client.types.js'

/**
 * Real GitHub client (AgDR-0014). Manifest conversion is one unauthenticated POST
 * (the `code` is the credential, ~1h TTL — AgDR-0006). Installation tokens go
 * through `@octokit/auth-app` (AgDR-0012), which signs the App JWT from the PEM,
 * exchanges it for a ~1h token, and caches + auto-refreshes internally.
 *
 * The per-App `auth` instance is cached so the library's token cache survives
 * across calls. The cache key is the App id **plus a fingerprint of the PEM**, so
 * rotating an App's private key refreshes the cached auth instead of minting with
 * the stale key. `createAuth` is an injectable seam (defaults to the real
 * `createAppAuth`) so tests substitute a fake without hitting GitHub.
 */
@Injectable()
export class OctokitGithubClient extends GithubClient {
  private readonly logger = new Logger(OctokitGithubClient.name)
  private readonly authByApp = new Map<
    string,
    { keyFingerprint: string; auth: ReturnType<AppAuthFactory> }
  >()

  constructor(@Optional() private readonly createAuth: AppAuthFactory = createAppAuth) {
    super()
  }

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

  async getInstallationToken(params: InstallationTokenParams): Promise<string> {
    const auth = this.authFor(params.githubAppId, params.privateKeyPem)
    try {
      const { token } = await auth({
        type: 'installation',
        installationId: params.installationId,
      })
      return token
    } catch (error) {
      // Log GitHub's detail server-side; surface a generic error to the caller.
      this.logger.error(`installation token mint failed: ${(error as Error).message}`)
      throw new Error('Could not mint a GitHub installation access token.')
    }
  }

  private authFor(githubAppId: string, privateKeyPem: string): ReturnType<AppAuthFactory> {
    const keyFingerprint = createHash('sha256').update(privateKeyPem).digest('hex')
    const cached = this.authByApp.get(githubAppId)
    if (cached && cached.keyFingerprint === keyFingerprint) {
      return cached.auth
    }
    const auth = this.createAuth({ appId: githubAppId, privateKey: privateKeyPem })
    this.authByApp.set(githubAppId, { keyFingerprint, auth })
    return auth
  }
}
