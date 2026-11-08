import { AppDeletionFailedJob } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.job.js'
import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import { Job } from '#src/modules/jobs/job.js'

export class DestroyAppRuntimeJob extends Job<AppDeletedPayload> {
  static readonly queue = 'destroy-app-runtime'
  static readonly options = {
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 120,
    expireInSeconds: 60,
    deadLetter: AppDeletionFailedJob.queue,
  }
}
