import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'
import { CompleteGithubLoginCommand } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import type { User } from '#src/app/user/entities/user.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class CompleteGithubLoginUseCase {
  private readonly logger = new Logger(CompleteGithubLoginUseCase.name)

  constructor(
    private readonly repository: CompleteGithubLoginRepository,
    private readonly github: GithubClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(
    command: CompleteGithubLoginCommand,
    sessionState: string | undefined,
  ): Promise<User> {
    if (!sessionState || sessionState !== command.state) {
      throw new BadRequestException('Invalid or expired OAuth state.')
    }

    const app = await this.repository.loadProvisionedApp()
    if (!app) {
      throw new BadRequestException('No provisioned GitHub App — create the App first.')
    }

    const clientSecret = this.cipher.decrypt(app.clientSecretEnc)

    let githubUser: { id: number; login: string }
    try {
      githubUser = await this.github.loginUser({
        clientId: app.clientId,
        clientSecret,
        code: command.code,
      })
    } catch (error) {
      this.logger.error(`user-OAuth login failed: ${(error as Error).message}`)
      throw new BadGatewayException('Could not complete login with GitHub.')
    }

    const user = await this.repository.consumeStateAndUpsertUser(
      command.state,
      String(githubUser.id),
      githubUser.login,
    )
    if (!user) {
      throw new BadRequestException('Invalid or expired OAuth state.')
    }
    return user
  }
}
