import { Module } from '@nestjs/common'
import { ViewBuildLogsController } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.controller.js'
import { ViewBuildLogsRepository } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.repository.js'
import { ViewBuildLogsUseCase } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.use-case.js'

@Module({
  controllers: [ViewBuildLogsController],
  providers: [ViewBuildLogsUseCase, ViewBuildLogsRepository],
})
export class ViewBuildLogsModule {}
