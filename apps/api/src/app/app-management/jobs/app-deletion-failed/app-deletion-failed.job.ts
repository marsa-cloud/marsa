import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import { Job } from '#src/modules/jobs/job.js'

export class AppDeletionFailedJob extends Job<AppDeletedPayload> {
  static readonly queue = 'app-deletion-failed'
  static readonly options = {
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 120,
  }
}
