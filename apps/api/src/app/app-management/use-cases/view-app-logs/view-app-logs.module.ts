import { Module } from '@nestjs/common'
import { ViewAppLogsController } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.controller.js'
import { ViewAppLogsRepository } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.repository.js'
import { ViewAppLogsUseCase } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.use-case.js'

@Module({
  controllers: [ViewAppLogsController],
  providers: [ViewAppLogsUseCase, ViewAppLogsRepository],
})
export class ViewAppLogsModule {}
