import { Module } from '@nestjs/common'
import { CompleteBuildModule } from '#src/app/build-management/use-cases/complete-build/complete-build.module.js'
import { BuildSweeper } from '#src/app/build-management/use-cases/sweep-builds/build-sweeper.cron.js'
import { SweepBuildsRepository } from '#src/app/build-management/use-cases/sweep-builds/sweep-builds.repository.js'

@Module({
  imports: [CompleteBuildModule],
  providers: [BuildSweeper, SweepBuildsRepository],
})
export class SweepBuildsModule {}
