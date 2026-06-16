import { Module } from '@nestjs/common'

import { OAuthStateModule } from '#src/app/auth/oauth-state.module.js'
import { CompleteGithubLoginController } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.controller.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import { CompleteGithubLoginUseCase } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule, OAuthStateModule],
  controllers: [CompleteGithubLoginController],
  providers: [CompleteGithubLoginUseCase, CompleteGithubLoginRepository],
})
export class CompleteGithubLoginModule {}
