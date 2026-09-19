import { Module } from '@nestjs/common'
import { ViewEnvironmentIndexController } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.controller.js'
import { ViewEnvironmentIndexRepository } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.repository.js'
import { ViewEnvironmentIndexUseCase } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.use-case.js'

@Module({
  controllers: [ViewEnvironmentIndexController],
  providers: [ViewEnvironmentIndexUseCase, ViewEnvironmentIndexRepository],
})
export class ViewEnvironmentIndexModule {}
