import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ManifestDto } from '#src/app/github-app/github-app.types.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { GetManifestResponse } from '#src/app/github-app/use-cases/get-manifest/get-manifest.response.js'
import { appName } from '#src/app/github-app/utils/app-name.js'
import { stripTrailingSlash } from '#src/utils/strip-trailing-slash.js'

const WEBHOOK_PATH = '/api/v1/github-app/webhooks'
const REDIRECT_PATH = '/setup/github/callback'
const OAUTH_CALLBACK_PATH = '/auth/github/callback'

@Injectable()
export class GetManifestUseCase {
  constructor(
    private readonly manifestState: ManifestStateService,
    private readonly configService: ConfigService,
  ) {}

  async execute(): Promise<GetManifestResponse> {
    const webUrl = stripTrailingSlash(this.configService.getOrThrow<string>('MARSA_WEB_URL'))
    const apiPublicUrl = stripTrailingSlash(
      this.configService.getOrThrow<string>('MARSA_API_PUBLIC_URL'),
    )

    const state = await this.manifestState.issue()

    const manifest = new ManifestDto({
      name: appName(webUrl),
      url: webUrl,
      webhookUrl: `${apiPublicUrl}${WEBHOOK_PATH}`,
      redirectUrl: `${webUrl}${REDIRECT_PATH}`,
      oauthCallbackUrl: `${webUrl}${OAUTH_CALLBACK_PATH}`,
    })

    const formAction = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`

    return new GetManifestResponse(manifest, formAction, state)
  }
}
