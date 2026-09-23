import { Module } from '@nestjs/common'
import { BuildStarterRepository } from '#src/app/build/services/build-starter.repository.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { StartBuildController } from '#src/app/build/use-cases/start-build/start-build.controller.js'
import { StartBuildRepository } from '#src/app/build/use-cases/start-build/start-build.repository.js'
import { StartBuildUseCase } from '#src/app/build/use-cases/start-build/start-build.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [StartBuildController],
  providers: [StartBuildUseCase, StartBuildRepository, BuildStarter, BuildStarterRepository],
})
export class StartBuildModule {}
