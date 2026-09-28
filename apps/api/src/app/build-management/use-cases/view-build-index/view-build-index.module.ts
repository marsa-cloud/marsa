import { Module } from '@nestjs/common'
import { ViewBuildIndexController } from '#src/app/build-management/use-cases/view-build-index/view-build-index.controller.js'
import { ViewBuildIndexRepository } from '#src/app/build-management/use-cases/view-build-index/view-build-index.repository.js'
import { ViewBuildIndexUseCase } from '#src/app/build-management/use-cases/view-build-index/view-build-index.use-case.js'

@Module({
  controllers: [ViewBuildIndexController],
  providers: [ViewBuildIndexUseCase, ViewBuildIndexRepository],
})
export class ViewBuildIndexModule {}
