import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Job as PgBossJob, PgBoss } from 'pg-boss'
import { sendableOptions } from '#src/modules/jobs/job.js'
import { PG_BOSS } from '#src/modules/jobs/job-queue.tokens.js'
import { type JobRegistration, JobRegistry } from '#src/modules/jobs/job-registry.js'

@Injectable()
export class JobQueueLifecycle implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(JobQueueLifecycle.name)

  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    private readonly registry: JobRegistry,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start()
    const workersEnabled = this.config.getOrThrow<boolean>('JOBS_WORKER_ENABLED')

    for (const registration of this.registry.registrations()) {
      const { queue, options, schedule } = registration.jobClass
      const updatable = sendableOptions(options)
      await this.boss.createQueue(queue, options)
      // pg-boss asserts on an empty update
      if (Object.keys(updatable).length > 0) await this.boss.updateQueue(queue, updatable)
      if (schedule) await this.boss.schedule(queue, schedule, null, updatable)
      if (workersEnabled) {
        await this.boss.work(queue, { batchSize: 1 }, ([job]) =>
          this.run(registration, job as PgBossJob<object> | undefined),
        )
      }
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true })
  }

  async run(
    { jobClass, handler }: JobRegistration,
    job: PgBossJob<object> | undefined,
  ): Promise<void> {
    if (!job) return
    try {
      await handler.handle(job.data, job)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`${jobClass.queue} ${job.id}: ${message}`)
      throw error
    }
  }
}
