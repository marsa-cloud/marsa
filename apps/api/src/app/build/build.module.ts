import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { StartBuildModule } from '#src/app/build/use-cases/start-build/start-build.module.js'
import { SweepBuildsModule } from '#src/app/build/use-cases/sweep-builds/sweep-builds.module.js'

@Module({
  imports: [
    // Tests and `pnpm dev:api` run the mock runtime; they drive sweep() directly, never on a timer.
    ConditionalModule.registerWhen(ScheduleModule.forRoot(), (env) => env.MARSA_RUNTIME !== 'mock'),
    StartBuildModule,
    SweepBuildsModule,
  ],
})
export class BuildModule {}
