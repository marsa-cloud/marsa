import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { CompleteBuildUseCase } from '#src/app/build/use-cases/complete-build/complete-build.use-case.js'
import {
  type RunningBuild,
  SweepBuildsRepository,
} from '#src/app/build/use-cases/sweep-builds/sweep-builds.repository.js'
import { BUILD_DEADLINE_SECONDS, BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { type BuildObservation, BuildState } from '#src/modules/runtime/runtime.types.js'

const GRACE_SECONDS = 300

@Injectable()
export class BuildSweeper {
  private readonly logger = new Logger(BuildSweeper.name)

  constructor(
    private readonly repository: SweepBuildsRepository,
    private readonly buildRuntime: BuildRuntime,
    private readonly completeBuild: CompleteBuildUseCase,
  ) {}

  @Cron('*/5 * * * * *', { name: 'build-sweep', waitForCompletion: true })
  async sweep(now: Date = new Date()): Promise<void> {
    for (const running of await this.repository.findRunning()) {
      try {
        const observation = await this.observe(running, now)
        if (observation.state !== BuildState.Running) {
          await this.completeBuild.execute(running.build.uuid, observation)
        }
      } catch (error) {
        this.logger.error(
          `sweeping build ${running.build.uuid} failed: ${(error as Error).message}`,
        )
      }
    }
  }

  private async observe({ build, appSlug }: RunningBuild, now: Date): Promise<BuildObservation> {
    const observation = await this.buildRuntime.readStatus({
      build: { uuid: build.uuid },
      app: { slug: appSlug },
    })
    const ageSeconds = (now.getTime() - build.createdAt.getTime()) / 1000
    // Backstop for a runtime that never reports a terminal state.
    if (
      observation.state === BuildState.Running &&
      ageSeconds > BUILD_DEADLINE_SECONDS + GRACE_SECONDS
    ) {
      return { state: BuildState.Failed, reason: 'The build exceeded its deadline.' }
    }
    return observation
  }
}
