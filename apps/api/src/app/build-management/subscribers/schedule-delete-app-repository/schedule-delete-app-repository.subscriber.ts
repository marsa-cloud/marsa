import { Injectable } from '@nestjs/common'
import { AppBuildsCancelledDomainEvent } from '#src/app/build-management/events/app-builds-cancelled.event.js'
import { DeleteAppRepositoryJob } from '#src/app/build-management/jobs/delete-app-repository/delete-app-repository.job.js'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import {
  type DomainEventSubscriber,
  Subscribe,
} from '#src/modules/domain-events/subscribe.decorator.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'

@Injectable()
@Subscribe(AppBuildsCancelledDomainEvent)
export class ScheduleDeleteAppRepositorySubscriber implements DomainEventSubscriber<AppBuildsCancelledDomainEvent> {
  constructor(private readonly scheduler: JobScheduler) {}

  async handle(event: AppBuildsCancelledDomainEvent, tx: Transaction): Promise<void> {
    await this.scheduler.send(tx, new DeleteAppRepositoryJob(event.content))
  }
}
