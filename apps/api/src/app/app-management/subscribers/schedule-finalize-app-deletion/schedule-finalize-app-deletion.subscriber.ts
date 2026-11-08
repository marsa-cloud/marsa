import { Injectable } from '@nestjs/common'
import { AppImagesDeletedDomainEvent } from '#src/app/app-management/events/app-images-deleted.event.js'
import { FinalizeAppDeletionJob } from '#src/app/app-management/jobs/finalize-app-deletion/finalize-app-deletion.job.js'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import {
  type DomainEventSubscriber,
  Subscribe,
} from '#src/modules/domain-events/subscribe.decorator.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'

@Injectable()
@Subscribe(AppImagesDeletedDomainEvent)
export class ScheduleFinalizeAppDeletionSubscriber implements DomainEventSubscriber<AppImagesDeletedDomainEvent> {
  constructor(private readonly scheduler: JobScheduler) {}

  async handle(event: AppImagesDeletedDomainEvent, tx: Transaction): Promise<void> {
    await this.scheduler.send(tx, new FinalizeAppDeletionJob(event.content))
  }
}
