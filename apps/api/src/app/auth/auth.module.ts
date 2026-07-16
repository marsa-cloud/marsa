import { Module } from '@nestjs/common'
import { BeginGithubLoginModule } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.module.js'
import { CompleteGithubLoginModule } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.module.js'

@Module({
  imports: [BeginGithubLoginModule, CompleteGithubLoginModule],
})
export class AuthModule {}
