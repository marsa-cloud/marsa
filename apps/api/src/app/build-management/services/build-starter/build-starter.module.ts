import { Module } from '@nestjs/common'
import { BuildStarterRepository } from '#src/app/build-management/services/build-starter/build-starter.repository.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  providers: [BuildStarter, BuildStarterRepository],
  exports: [BuildStarter],
})
export class BuildStarterModule {}
