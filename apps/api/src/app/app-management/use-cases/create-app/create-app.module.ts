import { Module } from '@nestjs/common'
import { CreateAppController } from '#src/app/app-management/use-cases/create-app/create-app.controller.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppUseCase } from '#src/app/app-management/use-cases/create-app/create-app.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [CreateAppController],
  providers: [CreateAppUseCase, CreateAppRepository],
})
export class CreateAppModule {}
