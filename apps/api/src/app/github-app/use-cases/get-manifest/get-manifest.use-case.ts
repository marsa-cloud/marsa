import { Inject, Injectable } from '@nestjs/common'

import { type GitHubAppConfig, githubAppConfig } from '#src/app/github-app/github-app.config.js'
import type { GitHubAppManifest } from '#src/app/github-app/github-app.types.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { GetManifestResponse } from '#src/app/github-app/use-cases/get-manifest/get-manifest.response.js'

@Injectable()
export class GetManifestUseCase {
  constructor(
    @Inject(githubAppConfig.KEY) private readonly config: GitHubAppConfig,
    private readonly stateSigner: StateSigner,
  ) {}

  execute(): GetManifestResponse {
    const state = this.stateSigner.sign()

    const manifest: GitHubAppManifest = {
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

    return new GetManifestResponse(manifest, formAction, state)
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
