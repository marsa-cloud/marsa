import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import type { DomainEvent, DomainEventClass } from '#src/modules/domain-events/domain-event.js'
import {
  Subscribe,
  type DomainEventSubscriber,
} from '#src/modules/domain-events/subscribe.decorator.js'
import { Injectable, type OnModuleInit } from '@nestjs/common'
import { DiscoveryService } from '@nestjs/core'

@Injectable()
export class DomainEventEmitter implements OnModuleInit {
  private readonly subscribers = new Map<DomainEventClass, DomainEventSubscriber[]>()

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    const wrappers = this.discovery.getProviders({ metadataKey: Subscribe.KEY })
    const seenConstructors = new Set<unknown>()

    for (const wrapper of wrappers) {
      const instance = wrapper.instance as DomainEventSubscriber | undefined
      const eventClass = this.discovery.getMetadataByDecorator(Subscribe, wrapper)
      if (!instance || !eventClass) continue

      const instanceName = instance.constructor.name
      if (typeof instance.handle !== 'function') {
        throw new Error(`${instanceName} is a @Subscribe subscriber but has no handle() method`)
      }
      if (seenConstructors.has(instance.constructor)) {
        throw new Error(`${instanceName} is registered as a @Subscribe subscriber more than once`)
      }
      seenConstructors.add(instance.constructor)

      const subscribers = this.subscribers.get(eventClass) ?? []
      subscribers.push(instance)
      this.subscribers.set(eventClass, subscribers)
    }
  }

  async emit(tx: Transaction, events: readonly DomainEvent<object>[]): Promise<void> {
    for (const event of events) {
      const subscribers = this.subscribers.get(event.constructor as DomainEventClass) ?? []
      for (const subscriber of subscribers) {
        await subscriber.handle(event, tx)
      }
    }
  }
}
