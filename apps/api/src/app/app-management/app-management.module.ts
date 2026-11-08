import { Module } from '@nestjs/common'
import { AppDeletionFailedJobModule } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.job.module.js'
import { DestroyAppRuntimeJobModule } from '#src/app/app-management/jobs/destroy-app-runtime/destroy-app-runtime.job.module.js'
import { FinalizeAppDeletionJobModule } from '#src/app/app-management/jobs/finalize-app-deletion/finalize-app-deletion.job.module.js'
import { ScheduleDestroyAppRuntimeModule } from '#src/app/app-management/subscribers/schedule-destroy-app-runtime/schedule-destroy-app-runtime.module.js'
import { ScheduleFinalizeAppDeletionModule } from '#src/app/app-management/subscribers/schedule-finalize-app-deletion/schedule-finalize-app-deletion.module.js'
import { CreateAppModule } from '#src/app/app-management/use-cases/create-app/create-app.module.js'
import { DeleteAppModule } from '#src/app/app-management/use-cases/delete-app/delete-app.module.js'
import { UpdateAppModule } from '#src/app/app-management/use-cases/update-app/update-app.module.js'
import { ViewAppDetailModule } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.module.js'
import { ViewAppHealthModule } from '#src/app/app-management/use-cases/view-app-health/view-app-health.module.js'
import { ViewAppIndexModule } from '#src/app/app-management/use-cases/view-app-index/view-app-index.module.js'
import { ViewAppLogsModule } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.module.js'

@Module({
  imports: [
    CreateAppModule,
    ViewAppIndexModule,
    ViewAppDetailModule,
    ViewAppHealthModule,
    ViewAppLogsModule,
    UpdateAppModule,
    DeleteAppModule,
    DestroyAppRuntimeJobModule,
    FinalizeAppDeletionJobModule,
    AppDeletionFailedJobModule,
    ScheduleDestroyAppRuntimeModule,
    ScheduleFinalizeAppDeletionModule,
  ],
})
export class AppManagementModule {}
