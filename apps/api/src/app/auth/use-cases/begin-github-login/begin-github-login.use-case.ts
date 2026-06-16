import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { GITHUB_OAUTH_AUTHORIZE_URL } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.constant.js'
import { BeginGithubLoginRepository } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.repository.js'
import { type GitHubAppConfig, githubAppConfig } from '#src/app/github-app/github-app.config.js'

@Injectable()
export class BeginGithubLoginUseCase {
  constructor(
    private readonly repository: BeginGithubLoginRepository,
    private readonly oauthState: OAuthStateService,
    @Inject(githubAppConfig.KEY) private readonly config: GitHubAppConfig,
  ) {}

  async execute(): Promise<string> {
    const app = await this.repository.loadProvisionedApp()
    if (!app) {
      throw new BadRequestException('No provisioned GitHub App — create the App first.')
    }

    const state = await this.oauthState.issue()

    const params = new URLSearchParams({
      client_id: app.clientId,
      state,
      redirect_uri: this.config.oauthCallbackUrl,
    })
    return `${GITHUB_OAUTH_AUTHORIZE_URL}?${params.toString()}`
  }
}
