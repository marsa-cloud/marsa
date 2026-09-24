import { Module } from '@nestjs/common'
import { BuildStarterModule } from '#src/app/build/services/build-starter.module.js'
import { StartBuildController } from '#src/app/build/use-cases/start-build/start-build.controller.js'
import { StartBuildRepository } from '#src/app/build/use-cases/start-build/start-build.repository.js'
import { StartBuildUseCase } from '#src/app/build/use-cases/start-build/start-build.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule, BuildStarterModule],
  controllers: [StartBuildController],
  providers: [StartBuildUseCase, StartBuildRepository],
})
export class StartBuildModule {}
