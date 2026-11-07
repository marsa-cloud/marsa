import { DiscoveryService } from '@nestjs/core'
import type { Job as PgBossJob } from 'pg-boss'
import type { JobClass } from '#src/modules/jobs/job.js'

export const JobHandler = DiscoveryService.createDecorator<JobClass>()

export interface JobHandlerInstance<TPayload extends object = object> {
  handle(payload: TPayload, job: PgBossJob<TPayload>): Promise<void>
}
