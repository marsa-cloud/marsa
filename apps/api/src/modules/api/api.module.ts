import { Module } from '@nestjs/common'
import { AppModule } from '#src/app.module.js'
import { AppManagementModule } from '#src/app/app-management/app-management.module.js'
import { AuthModule } from '#src/app/auth/auth.module.js'
import { GitHubAppModule } from '#src/app/github-app/github-app.module.js'
import { ReleaseModule } from '#src/app/release/release.module.js'
import { UserModule } from '#src/app/user/user.module.js'
import { StatusModule } from '#src/modules/status/status.module.js'

@Module({
  imports: [
    AppModule.forRoot([
      StatusModule,
      GitHubAppModule,
      AuthModule,
      UserModule,
      ReleaseModule,
      AppManagementModule,
    ]),
  ],
})
export class ApiModule {}
