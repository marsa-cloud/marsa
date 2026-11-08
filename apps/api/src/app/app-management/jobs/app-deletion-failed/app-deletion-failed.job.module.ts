import { Module } from '@nestjs/common'
import { AppDeletionFailedJobHandler } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.job-handler.js'
import { AppDeletionFailedRepository } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.repository.js'

@Module({
  providers: [AppDeletionFailedJobHandler, AppDeletionFailedRepository],
})
export class AppDeletionFailedJobModule {}
