import { Injectable } from '@nestjs/common'
import { AppDeletedDomainEvent } from '#src/app/app-management/events/app-deleted.event.js'
import { DestroyAppRuntimeJob } from '#src/app/app-management/jobs/destroy-app-runtime/destroy-app-runtime.job.js'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import {
  type DomainEventSubscriber,
  Subscribe,
} from '#src/modules/domain-events/subscribe.decorator.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'

@Injectable()
@Subscribe(AppDeletedDomainEvent)
export class ScheduleDestroyAppRuntimeSubscriber implements DomainEventSubscriber<AppDeletedDomainEvent> {
  constructor(private readonly scheduler: JobScheduler) {}

  async handle(event: AppDeletedDomainEvent, tx: Transaction): Promise<void> {
    await this.scheduler.send(tx, new DestroyAppRuntimeJob(event.content))
  }
}
