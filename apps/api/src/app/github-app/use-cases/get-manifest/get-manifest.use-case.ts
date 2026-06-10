import { Inject, Injectable } from '@nestjs/common'

import { type GitHubAppConfig, githubAppConfig } from '#src/app/github-app/github-app.config.js'
import { ManifestDto } from '#src/app/github-app/github-app.types.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { GetManifestResponse } from '#src/app/github-app/use-cases/get-manifest/get-manifest.response.js'
import { appName } from '#src/app/github-app/utils/app-name.js'

@Injectable()
export class GetManifestUseCase {
  constructor(
    @Inject(githubAppConfig.KEY) private readonly config: GitHubAppConfig,
    private readonly manifestState: ManifestStateService,
  ) {}

  async execute(): Promise<GetManifestResponse> {
    const state = await this.manifestState.issue()

    const manifest = new ManifestDto({
      name: appName(this.config.webUrl),
      url: this.config.webUrl,
      webhookUrl: this.config.webhookUrl,
      redirectUrl: this.config.redirectUrl,
      oauthCallbackUrl: this.config.oauthCallbackUrl,
    })

    const formAction = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`

    return new GetManifestResponse(manifest, formAction, state)
  }
}
