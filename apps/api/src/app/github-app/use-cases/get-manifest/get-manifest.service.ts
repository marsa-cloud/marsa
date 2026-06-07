import { Injectable } from '@nestjs/common'

import { GitHubAppConfig } from '#src/app/github-app/github-app.config.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import type { GetManifestResponse } from '#src/app/github-app/use-cases/get-manifest/get-manifest.response.js'

@Injectable()
export class GetManifestService {
  constructor(
    private readonly config: GitHubAppConfig,
    private readonly stateSigner: StateSigner,
  ) {}

  execute(): GetManifestResponse {
    const state = this.stateSigner.sign()

    const manifest: Record<string, unknown> = {
      name: appName(this.config.webUrl),
      url: this.config.webUrl,
      hook_attributes: { url: this.config.webhookUrl },
      redirect_url: this.config.redirectUrl,
      callback_urls: [this.config.oauthCallbackUrl],
      public: false,
      request_oauth_on_install: true,
      default_permissions: { contents: 'read', metadata: 'read' },
      default_events: ['push'],
    }

    const formAction = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`

    return { manifest, formAction, state }
  }
}

/** GitHub App names are globally unique and capped at 34 chars. */
function appName(webUrl: string): string {
  const host = webUrl
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `marsa-${host}`.slice(0, 34).replace(/-+$/g, '')
}
