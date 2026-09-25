import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { buildRefOf } from '#src/app/build-management/entities/build-ref.js'
import { CompleteBuildUseCase } from '#src/app/build-management/use-cases/complete-build/complete-build.use-case.js'
import {
  GRACE_SECONDS,
  SWEEP_CONCURRENCY,
  SWEEP_PAGE_SIZE,
} from '#src/app/build-management/use-cases/sweep-builds/sweep-builds.constants.js'
import {
  type RunningBuild,
  SweepBuildsRepository,
} from '#src/app/build-management/use-cases/sweep-builds/sweep-builds.repository.js'
import { BUILD_DEADLINE_SECONDS, BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { type BuildObservation, BuildState } from '#src/modules/runtime/runtime.types.js'

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
    let after: BuildUuid | undefined
    let page: RunningBuild[]
    do {
      page = await this.repository.findRunning(SWEEP_PAGE_SIZE, after)
      for (let i = 0; i < page.length; i += SWEEP_CONCURRENCY) {
        const chunk = page.slice(i, i + SWEEP_CONCURRENCY)
        await Promise.all(chunk.map((running) => this.sweepOne(running, now)))
      }
      after = page.at(-1)?.build.uuid
    } while (page.length === SWEEP_PAGE_SIZE)
  }

  private async sweepOne(running: RunningBuild, now: Date): Promise<void> {
    try {
      const observation = await this.observe(running, now)
      if (observation.state !== BuildState.Running) {
        await this.completeBuild.execute(running.build.uuid, observation)
      }
    } catch (error) {
      this.logger.error(`sweeping build ${running.build.uuid} failed: ${(error as Error).message}`)
    }
  }

  private async observe({ build, appSlug }: RunningBuild, now: Date): Promise<BuildObservation> {
    const observation = await this.buildRuntime.readStatus(buildRefOf(appSlug, build.uuid))
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
