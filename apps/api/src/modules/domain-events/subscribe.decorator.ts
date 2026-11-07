import { DiscoveryService } from '@nestjs/core'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import type { DomainEvent, DomainEventClass } from '#src/modules/domain-events/domain-event.js'

export const Subscribe = DiscoveryService.createDecorator<DomainEventClass>()

export interface DomainEventSubscriber<TEvent extends DomainEvent<object> = DomainEvent<object>> {
  handle(event: TEvent, tx: Transaction): Promise<void>
}
