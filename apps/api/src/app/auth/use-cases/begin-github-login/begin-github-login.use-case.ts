import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { GITHUB_OAUTH_AUTHORIZE_URL } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.constant.js'
import { BeginGithubLoginRepository } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.repository.js'

export interface BeginGithubLoginResult {
  authorizeUrl: string
  /** Bound into the session by the controller, to be matched at complete-login (#62 login-CSRF). */
  state: OAuthStateUuid
}

@Injectable()
export class BeginGithubLoginUseCase {
  constructor(
    private readonly repository: BeginGithubLoginRepository,
    private readonly oauthState: OAuthStateService,
    private readonly configService: ConfigService,
  ) {}

  async execute(): Promise<BeginGithubLoginResult> {
    const app = await this.repository.loadProvisionedApp()
    if (!app) {
      throw new BadRequestException('No provisioned GitHub App — create the App first.')
    }

    const state = await this.oauthState.issue()

    const params = new URLSearchParams({
      client_id: app.clientId,
      state,
      redirect_uri: this.configService.getOrThrow('MARSA_API_PUBLIC_URL') + '/auth/github/callback',
    })
    return { authorizeUrl: `${GITHUB_OAUTH_AUTHORIZE_URL}?${params.toString()}`, state }
  }
}
