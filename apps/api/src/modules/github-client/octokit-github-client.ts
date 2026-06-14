import { createHash } from 'node:crypto'

import { Injectable, Logger } from '@nestjs/common'
import { createAppAuth } from '@octokit/auth-app'

import { GITHUB_API } from '#src/modules/github-client/github-client.constants.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import type {
  GitHubAppCredentials,
  GitHubManifestConversionResponse,
  InstallationTokenParams,
} from '#src/modules/github-client/github-client.types.js'

@Injectable()
export class OctokitGithubClient extends GithubClient {
  private readonly logger = new Logger(OctokitGithubClient.name)
  private readonly authByApp = new Map<
    string,
    { keyFingerprint: string; auth: ReturnType<typeof createAppAuth> }
  >()

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

  private authFor(githubAppId: string, privateKeyPem: string): ReturnType<typeof createAppAuth> {
    const keyFingerprint = createHash('sha256').update(privateKeyPem).digest('hex')
    const cached = this.authByApp.get(githubAppId)
    if (cached && cached.keyFingerprint === keyFingerprint) {
      return cached.auth
    }

    const auth = createAppAuth({ appId: githubAppId, privateKey: privateKeyPem })
    this.authByApp.set(githubAppId, { keyFingerprint, auth })
    return auth
  }
}
