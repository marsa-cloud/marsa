import { Module } from '@nestjs/common'
import { ListAppsModule } from '#src/app/app-management/use-cases/list-apps/list-apps.module.js'

@Module({
  imports: [ListAppsModule],
})
export class AppManagementModule {}
