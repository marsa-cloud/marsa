import { Injectable } from '@nestjs/common'
import type { Job as PgBossJob } from 'pg-boss'
import { AppDeletionFailedJob } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.job.js'
import { AppDeletionFailedRepository } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.repository.js'
import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { JobHandler, type JobHandlerInstance } from '#src/modules/jobs/job-handler.decorator.js'

@Injectable()
@JobHandler(AppDeletionFailedJob)
export class AppDeletionFailedJobHandler implements JobHandlerInstance<AppDeletedPayload> {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: AppDeletionFailedRepository,
  ) {}

  async handle(payload: AppDeletedPayload, job: PgBossJob<AppDeletedPayload>): Promise<void> {
    const source = job as unknown as {
      sourceName?: string
      sourceOutput?: { message?: string } | string | null
    }
    const step = source.sourceName ?? 'unknown'
    const message =
      typeof source.sourceOutput === 'string'
        ? source.sourceOutput
        : (source.sourceOutput?.message ?? JSON.stringify(source.sourceOutput ?? null))
    await this.db.transaction((tx) =>
      this.repository.markDeletionFailed(tx, payload.appUuid, `${step}: ${message}`),
    )
  }
}
