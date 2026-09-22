import { Module } from '@nestjs/common'
import { AppModule } from '#src/app.module.js'
import { AppManagementModule } from '#src/app/app-management/app-management.module.js'
import { AuthModule } from '#src/app/auth/auth.module.js'
import { ClusterModule } from '#src/app/cluster/cluster.module.js'
import { EnvironmentModule } from '#src/app/environment/environment.module.js'
import { GitHubAppModule } from '#src/app/github-app/github-app.module.js'
import { ProjectModule } from '#src/app/project/project.module.js'
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
      ProjectModule,
      EnvironmentModule,
      ReleaseModule,
      AppManagementModule,
      ClusterModule,
    ]),
  ],
})
export class ApiModule {}
