import { Module } from '@nestjs/common'
import { FinalizeAppDeletionJobHandler } from '#src/app/app-management/jobs/finalize-app-deletion/finalize-app-deletion.job-handler.js'
import { FinalizeAppDeletionRepository } from '#src/app/app-management/jobs/finalize-app-deletion/finalize-app-deletion.repository.js'

@Module({
  providers: [FinalizeAppDeletionJobHandler, FinalizeAppDeletionRepository],
})
export class FinalizeAppDeletionJobModule {}
