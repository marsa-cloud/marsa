import { AppDeletionFailedJob } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.job.js'
import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import { Job } from '#src/modules/jobs/job.js'

export class CancelAppBuildsJob extends Job<AppDeletedPayload> {
  static readonly queue = 'cancel-app-builds'
  static readonly options = {
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 120,
    expireInSeconds: 120,
    deadLetter: AppDeletionFailedJob.queue,
  }
}
