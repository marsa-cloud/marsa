import { EntityManager } from '@mikro-orm/core'
import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'

import { CompleteGithubLoginCommand } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class CompleteGithubLoginUseCase {
  private readonly logger = new Logger(CompleteGithubLoginUseCase.name)

  constructor(
    private readonly em: EntityManager,
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

    return this.em.transactional(async () => {
      const consumed = await this.repository.consumeState(command.state)
      if (!consumed) {
        throw new BadRequestException('Invalid or expired OAuth state.')
      }

      // The first user to ever complete login bootstraps the platform Operator;
      // everyone after is a Member. Counted inside the tx alongside the upsert
      // so the decision and the insert share one consistent view (AgDR-0024).
      const role = (await this.repository.countUsers()) === 0 ? UserRole.Operator : UserRole.Member

      return this.repository.upsertUser(String(githubUser.id), githubUser.login, role)
    })
  }
}
