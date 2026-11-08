import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { CancelAppBuildsJobModule } from '#src/app/build-management/jobs/cancel-app-builds/cancel-app-builds.job.module.js'
import { DeleteAppRepositoryJobModule } from '#src/app/build-management/jobs/delete-app-repository/delete-app-repository.job.module.js'
import { ScheduleCancelAppBuildsModule } from '#src/app/build-management/subscribers/schedule-cancel-app-builds/schedule-cancel-app-builds.module.js'
import { ScheduleDeleteAppRepositoryModule } from '#src/app/build-management/subscribers/schedule-delete-app-repository/schedule-delete-app-repository.module.js'
import { ReceivePushModule } from '#src/app/build-management/use-cases/receive-push/receive-push.module.js'
import { StartBuildModule } from '#src/app/build-management/use-cases/start-build/start-build.module.js'
import { SweepBuildsModule } from '#src/app/build-management/use-cases/sweep-builds/sweep-builds.module.js'
import { ViewBuildIndexModule } from '#src/app/build-management/use-cases/view-build-index/view-build-index.module.js'
import { ViewBuildLogsModule } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.module.js'

@Module({
  imports: [
    // Tests and `pnpm dev:api` run the mock runtime; they drive sweep() directly, never on a timer.
    ConditionalModule.registerWhen(ScheduleModule.forRoot(), (env) => env.MARSA_RUNTIME !== 'mock'),
    CancelAppBuildsJobModule,
    DeleteAppRepositoryJobModule,
    ScheduleCancelAppBuildsModule,
    ScheduleDeleteAppRepositoryModule,
    StartBuildModule,
    ReceivePushModule,
    SweepBuildsModule,
    ViewBuildIndexModule,
    ViewBuildLogsModule,
  ],
})
export class BuildManagementModule {}
