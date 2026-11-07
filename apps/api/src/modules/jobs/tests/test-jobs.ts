import { Injectable, Module } from '@nestjs/common'
import type { Job as PgBossJob } from 'pg-boss'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { Job, type JobQueueOptions } from '#src/modules/jobs/job.js'
import { JobHandler, type JobHandlerInstance } from '#src/modules/jobs/job-handler.decorator.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'

export const calls: Record<string, unknown[]> = {}

function record(queue: string, payload: unknown): void {
  ;(calls[queue] ??= []).push(payload)
}

type NumberPayload = { n: number }

export class EchoJob extends Job<NumberPayload> {
  static readonly queue = 'test-echo'
}

export class ChainJob extends Job<NumberPayload> {
  static readonly queue = 'test-chain'
}

export class FlakyJob extends Job<NumberPayload> {
  static readonly queue = 'test-flaky'
  static readonly options: JobQueueOptions = { retryLimit: 3, retryDelay: 60 }
}

export class FailingJob extends Job<NumberPayload> {
  static readonly queue = 'test-failing'
  static readonly options: JobQueueOptions = {
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: 'test-dead-letter',
  }
}

export class DeadLetterJob extends Job<NumberPayload> {
  static readonly queue = 'test-dead-letter'
}

export class CronJob extends Job<object> {
  static readonly queue = 'test-cron'
  static readonly schedule = '0 3 * * *'
}

@Injectable()
@JobHandler(EchoJob)
export class EchoJobHandler implements JobHandlerInstance<NumberPayload> {
  handle(payload: NumberPayload): Promise<void> {
    record(EchoJob.queue, payload)
    return Promise.resolve()
  }
}

@Injectable()
@JobHandler(ChainJob)
export class ChainJobHandler implements JobHandlerInstance<NumberPayload> {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly scheduler: JobScheduler,
  ) {}

  async handle(payload: NumberPayload): Promise<void> {
    await this.db.transaction((tx) => this.scheduler.send(tx, new EchoJob({ n: payload.n + 1 })))
  }
}

@Injectable()
@JobHandler(FlakyJob)
export class FlakyJobHandler implements JobHandlerInstance<NumberPayload> {
  handle(payload: NumberPayload, job: PgBossJob<NumberPayload>): Promise<void> {
    if (job.retryCount < 2) return Promise.reject(new Error('flaky'))
    record(FlakyJob.queue, payload)
    return Promise.resolve()
  }
}

@Injectable()
@JobHandler(FailingJob)
export class FailingJobHandler implements JobHandlerInstance<NumberPayload> {
  handle(): Promise<void> {
    return Promise.reject(new Error('nope'))
  }
}

@Injectable()
@JobHandler(DeadLetterJob)
export class DeadLetterJobHandler implements JobHandlerInstance<NumberPayload> {
  handle(payload: NumberPayload): Promise<void> {
    record(DeadLetterJob.queue, payload)
    return Promise.resolve()
  }
}

@Injectable()
@JobHandler(CronJob)
export class CronJobHandler implements JobHandlerInstance<object> {
  handle(payload: object): Promise<void> {
    record(CronJob.queue, payload)
    return Promise.resolve()
  }
}

@Module({
  providers: [
    EchoJobHandler,
    ChainJobHandler,
    FlakyJobHandler,
    FailingJobHandler,
    DeadLetterJobHandler,
    CronJobHandler,
  ],
})
export class TestJobsModule {}
