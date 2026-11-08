import { Injectable } from '@nestjs/common'
import { FinalizeAppDeletionJob } from '#src/app/app-management/jobs/finalize-app-deletion/finalize-app-deletion.job.js'
import { FinalizeAppDeletionRepository } from '#src/app/app-management/jobs/finalize-app-deletion/finalize-app-deletion.repository.js'
import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { JobHandler, type JobHandlerInstance } from '#src/modules/jobs/job-handler.decorator.js'

@Injectable()
@JobHandler(FinalizeAppDeletionJob)
export class FinalizeAppDeletionJobHandler implements JobHandlerInstance<AppDeletedPayload> {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: FinalizeAppDeletionRepository,
  ) {}

  async handle(payload: AppDeletedPayload): Promise<void> {
    await this.db.transaction((tx) => this.repository.deleteWithHistory(tx, payload.appUuid))
  }
}
