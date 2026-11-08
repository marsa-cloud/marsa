import { Injectable } from '@nestjs/common'
import { AppRuntimeDestroyedDomainEvent } from '#src/app/app-management/events/app-runtime-destroyed.event.js'
import { CancelAppBuildsJob } from '#src/app/build-management/jobs/cancel-app-builds/cancel-app-builds.job.js'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import {
  type DomainEventSubscriber,
  Subscribe,
} from '#src/modules/domain-events/subscribe.decorator.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'

@Injectable()
@Subscribe(AppRuntimeDestroyedDomainEvent)
export class ScheduleCancelAppBuildsSubscriber implements DomainEventSubscriber<AppRuntimeDestroyedDomainEvent> {
  constructor(private readonly scheduler: JobScheduler) {}

  async handle(event: AppRuntimeDestroyedDomainEvent, tx: Transaction): Promise<void> {
    await this.scheduler.send(tx, new CancelAppBuildsJob(event.content))
  }
}
