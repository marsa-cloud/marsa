import { Module } from '@nestjs/common'

import { AppModule } from '#src/app.module.js'
import { AuthModule } from '#src/app/auth/auth.module.js'
import { GitHubAppModule } from '#src/app/github-app/github-app.module.js'
import { StatusModule } from '#src/modules/status/status.module.js'

@Module({
  imports: [AppModule.forRoot([StatusModule, GitHubAppModule, AuthModule])],
})
export class ApiModule {}
