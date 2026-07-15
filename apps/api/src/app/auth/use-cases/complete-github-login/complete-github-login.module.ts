import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'
import { CompleteGithubLoginController } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.controller.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import { CompleteGithubLoginUseCase } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.use-case.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule, MikroOrmModule.forFeature([GitHubApp, OAuthState, User])],
  controllers: [CompleteGithubLoginController],
  providers: [CompleteGithubLoginUseCase, CompleteGithubLoginRepository],
})
export class CompleteGithubLoginModule {}
