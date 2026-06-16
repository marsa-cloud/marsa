import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'

import { Operator } from '#src/app/auth/entities/operator.entity.js'
import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { CompleteGithubLoginCommand } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class CompleteGithubLoginUseCase {
  private readonly logger = new Logger(CompleteGithubLoginUseCase.name)

  constructor(
    private readonly repository: CompleteGithubLoginRepository,
    private readonly oauthState: OAuthStateService,
    private readonly github: GithubClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: CompleteGithubLoginCommand): Promise<Operator> {
    // Field presence/type is enforced at the DTO boundary by class-validator, so
    // it isn't re-checked here.
    const stateValid = await this.oauthState.consume(command.state)
    if (!stateValid) {
      throw new BadRequestException('Invalid or expired OAuth state.')
    }

    const app = await this.repository.loadProvisionedApp()
    if (!app) {
      throw new BadRequestException('No provisioned GitHub App — create the App first.')
    }

    // Decrypt the stored secret up front, outside the GitHub call's try/catch, so
    // a local decrypt/config failure surfaces as itself rather than being
    // misreported as a GitHub exchange (502) error.
    const clientSecret = this.cipher.decrypt(app.clientSecretEnc)

    let userAccessToken: string
    let githubUser: { id: number; login: string }
    try {
      userAccessToken = await this.github.exchangeUserOAuthCode({
        clientId: app.clientId,
        clientSecret,
        code: command.code,
      })
      githubUser = await this.github.getAuthenticatedUser(userAccessToken)
    } catch (error) {
      this.logger.error(`user-OAuth login failed: ${(error as Error).message}`)
      throw new BadGatewayException('Could not complete login with GitHub.')
    }

    return this.repository.upsertByGithubUserId(String(githubUser.id), githubUser.login)
  }
}
