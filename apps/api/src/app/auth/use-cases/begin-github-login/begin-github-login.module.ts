import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { OAuthStateModule } from '#src/app/auth/oauth-state.module.js'
import { BeginGithubLoginController } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.controller.js'
import { BeginGithubLoginRepository } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.repository.js'
import { BeginGithubLoginUseCase } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.use-case.js'
import { githubAppConfig } from '#src/app/github-app/github-app.config.js'

@Module({
  imports: [ConfigModule.forFeature(githubAppConfig), OAuthStateModule],
  controllers: [BeginGithubLoginController],
  providers: [BeginGithubLoginUseCase, BeginGithubLoginRepository],
})
export class BeginGithubLoginModule {}
