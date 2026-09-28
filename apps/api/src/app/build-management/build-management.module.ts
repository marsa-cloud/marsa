import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { StartBuildModule } from '#src/app/build-management/use-cases/start-build/start-build.module.js'
import { SweepBuildsModule } from '#src/app/build-management/use-cases/sweep-builds/sweep-builds.module.js'
import { ViewBuildIndexModule } from '#src/app/build-management/use-cases/view-build-index/view-build-index.module.js'
import { ViewBuildLogsModule } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.module.js'

@Module({
  imports: [
    // Tests and `pnpm dev:api` run the mock runtime; they drive sweep() directly, never on a timer.
    ConditionalModule.registerWhen(ScheduleModule.forRoot(), (env) => env.MARSA_RUNTIME !== 'mock'),
    StartBuildModule,
    SweepBuildsModule,
    ViewBuildIndexModule,
    ViewBuildLogsModule,
  ],
})
export class BuildManagementModule {}
