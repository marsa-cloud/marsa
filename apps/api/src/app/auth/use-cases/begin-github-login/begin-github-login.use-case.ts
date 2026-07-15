import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { GITHUB_OAUTH_AUTHORIZE_URL } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.constant.js'
import { BeginGithubLoginRepository } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.repository.js'
import { stripTrailingSlash } from '#src/utils/strip-trailing-slash.js'

/** Web route hosting the GitHub-App provisioning wizard (bootstrap entry point). */
const SETUP_PATH = '/setup/github'

/**
 * Web route GitHub redirects to after OAuth consent. The SPA there reads
 * code+state and POSTs them to complete-login. Must stay in lockstep with the
 * `oauthCallbackUrl` registered in the GitHub App manifest (get-manifest).
 */
const OAUTH_CALLBACK_PATH = '/auth/github/callback'

/**
 * Either begin the OAuth handshake (App provisioned) or send the browser to the
 * setup wizard (no App yet). The unprovisioned case is the first-run bootstrap:
 * the operator can't have logged in before the App exists, so erroring would
 * dead-end them — redirect to provisioning instead.
 */
export type BeginGithubLoginResult =
  | {
      kind: 'oauth'
      authorizeUrl: string
      /** Bound into the session by the controller, to be matched at complete-login (#62 login-CSRF). */
      state: OAuthStateUuid
    }
  | { kind: 'setup'; setupUrl: string }

@Injectable()
export class BeginGithubLoginUseCase {
  constructor(
    private readonly repository: BeginGithubLoginRepository,
    private readonly oauthState: OAuthStateService,
    private readonly configService: ConfigService,
  ) {}

  async execute(): Promise<BeginGithubLoginResult> {
    const webUrl = stripTrailingSlash(this.configService.getOrThrow<string>('MARSA_WEB_URL'))

    const app = await this.repository.loadProvisionedApp()
    if (!app) {
      return { kind: 'setup', setupUrl: `${webUrl}${SETUP_PATH}` }
    }

    const state = await this.oauthState.issue()

    const params = new URLSearchParams({
      client_id: app.clientId,
      state,
      redirect_uri: `${webUrl}${OAUTH_CALLBACK_PATH}`,
    })
    return {
      kind: 'oauth',
      authorizeUrl: `${GITHUB_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
      state,
    }
  }
}
