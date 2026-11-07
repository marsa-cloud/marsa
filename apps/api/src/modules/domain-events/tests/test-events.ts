import { Injectable, Module } from '@nestjs/common'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import { DomainEvent } from '#src/modules/domain-events/domain-event.js'
import {
  type DomainEventSubscriber,
  Subscribe,
} from '#src/modules/domain-events/subscribe.decorator.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'
import { EchoJob, TestJobsModule } from '#src/modules/jobs/tests/test-jobs.js'

type NumberContent = { n: number }

export const sentBeforeFailure: NumberContent[] = []

export class TestEvent extends DomainEvent<NumberContent> {}

export class FailingEvent extends DomainEvent<NumberContent> {}

@Injectable()
@Subscribe(TestEvent)
export class SendsEchoSubscriber implements DomainEventSubscriber<TestEvent> {
  constructor(private readonly scheduler: JobScheduler) {}

  async handle(event: TestEvent, tx: Transaction): Promise<void> {
    await this.scheduler.send(tx, new EchoJob(event.content))
  }
}

@Injectable()
@Subscribe(FailingEvent)
export class SendsEchoOnFailingSubscriber implements DomainEventSubscriber<FailingEvent> {
  constructor(private readonly scheduler: JobScheduler) {}

  async handle(event: FailingEvent, tx: Transaction): Promise<void> {
    await this.scheduler.send(tx, new EchoJob(event.content))
    sentBeforeFailure.push(event.content)
  }
}

@Injectable()
@Subscribe(FailingEvent)
export class ThrowingSubscriber implements DomainEventSubscriber<FailingEvent> {
  handle(): Promise<void> {
    return Promise.reject(new Error('subscriber failed'))
  }
}

@Module({
  imports: [TestJobsModule],
  providers: [SendsEchoSubscriber, SendsEchoOnFailingSubscriber, ThrowingSubscriber],
})
export class TestDomainEventsModule {}
