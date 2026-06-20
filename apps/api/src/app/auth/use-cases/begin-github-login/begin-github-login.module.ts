import { Module } from '@nestjs/common'

import { OAuthStateModule } from '#src/app/auth/oauth-state.module.js'
import { BeginGithubLoginController } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.controller.js'
import { BeginGithubLoginRepository } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.repository.js'
import { BeginGithubLoginUseCase } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.use-case.js'

@Module({
  imports: [OAuthStateModule],
  controllers: [BeginGithubLoginController],
  providers: [BeginGithubLoginUseCase, BeginGithubLoginRepository],
})
export class BeginGithubLoginModule {}
