import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { fromDrizzle, type PgBoss, type SendOptions } from 'pg-boss'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import type { Job, JobClass } from '#src/modules/jobs/job.js'
import { PG_BOSS } from '#src/modules/jobs/job-queue.tokens.js'
import { JobRegistry } from '#src/modules/jobs/job-registry.js'

export type JobSendOverrides = Omit<SendOptions, 'db'>

function sendable(options: JobClass['options']): SendOptions {
  return Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'policy'))
}

@Injectable()
export class JobScheduler {
  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    private readonly registry: JobRegistry,
  ) {}

  async send<TPayload extends object>(
    tx: Transaction,
    job: Job<TPayload>,
    overrides?: JobSendOverrides,
  ): Promise<string | null> {
    const jobClass = job.constructor as JobClass<TPayload>
    if (!this.registry.isRegistered(jobClass.queue)) {
      throw new Error(`No @JobHandler registered for queue '${jobClass.queue}'`)
    }
    // Class options ride on every send: createQueue never updates an existing queue.
    return this.boss.send(jobClass.queue, job.payload, {
      ...sendable(jobClass.options),
      ...overrides,
      db: fromDrizzle(tx, sql),
    })
  }
}
