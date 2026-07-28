import { Module } from '@nestjs/common'
import { ViewAppHealthModule } from '#src/app/app-management/use-cases/view-app-health/view-app-health.module.js'
import { ViewAppIndexModule } from '#src/app/app-management/use-cases/view-app-index/view-app-index.module.js'
import { ViewAppLogsModule } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.module.js'

@Module({
  imports: [ViewAppIndexModule, ViewAppHealthModule, ViewAppLogsModule],
})
export class AppManagementModule {}
