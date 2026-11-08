import { before, describe, it } from 'node:test'
import { DiscoveryService as DiscoveryServiceClass } from '@nestjs/core'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import { DomainEvent, type DomainEventClass } from '#src/modules/domain-events/domain-event.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'
import type { DomainEventSubscriber } from '#src/modules/domain-events/subscribe.decorator.js'
import { TestBench } from '#src/test/setup/test-bench.js'

type LogEntry = [string, DomainEvent<object>, Transaction]

type StubSubscriber = { instance: object; eventClass: DomainEventClass; requestScoped?: boolean }

function emitterOver(subscribers: StubSubscriber[]): DomainEventEmitter {
  const discovery = createStubInstance(DiscoveryServiceClass)
  const wrappers = subscribers.map((s) => ({
    ...s,
    name: s.instance?.constructor.name,
    isDependencyTreeStatic: () => !s.requestScoped,
  }))
  discovery.getProviders.returns(wrappers as never)
  discovery.getMetadataByDecorator.callsFake(
    (_d: unknown, w: unknown) => (w as { eventClass: DomainEventClass }).eventClass,
  )
  return new DomainEventEmitter(discovery)
}

class OrderPlaced extends DomainEvent<object> {}
class OrderShipped extends DomainEvent<object> {}
class Unheard extends DomainEvent<object> {}

class ThrowingSubscriber implements DomainEventSubscriber {
  readonly error: Error

  constructor(error: Error) {
    this.error = error
  }

  handle(): Promise<void> {
    return Promise.reject(this.error)
  }
}

function loggingSubscriberClass(name: string, log: LogEntry[]): new () => DomainEventSubscriber {
  const cls = class implements DomainEventSubscriber {
    handle(event: DomainEvent<object>, tx: Transaction): Promise<void> {
      log.push([name, event, tx])
      return Promise.resolve()
    }
  }
  Object.defineProperty(cls, 'name', { value: name })
  return cls
}

describe('DomainEventEmitter', () => {
  before(() => TestBench.setupUnitTest())

  it('runs every subscriber of an event with the same tx, in discovery order', async () => {
    const log: LogEntry[] = []
    const A = loggingSubscriberClass('A', log)
    const B = loggingSubscriberClass('B', log)
    const emitter = emitterOver([
      { instance: new A(), eventClass: OrderPlaced },
      { instance: new B(), eventClass: OrderPlaced },
    ])
    emitter.onModuleInit()

    const tx = {} as Transaction
    const event = new OrderPlaced({})
    await emitter.emit(tx, [event])

    expect(log).toEqual([
      ['A', event, tx],
      ['B', event, tx],
    ])
    expect(log[0]?.[2]).toBe(tx)
    expect(log[1]?.[2]).toBe(tx)
  })

  it('runs events in the order given', async () => {
    const log: LogEntry[] = []
    const ShippedSub = loggingSubscriberClass('shipped-sub', log)
    const PlacedSub = loggingSubscriberClass('placed-sub', log)
    const emitter = emitterOver([
      { instance: new ShippedSub(), eventClass: OrderShipped },
      { instance: new PlacedSub(), eventClass: OrderPlaced },
    ])
    emitter.onModuleInit()

    const placed = new OrderPlaced({})
    const shipped = new OrderShipped({})
    await emitter.emit({} as Transaction, [placed, shipped])

    expect(log.map(([name]) => name)).toEqual(['placed-sub', 'shipped-sub'])
  })

  it('skips subscribers of other events', async () => {
    const log: LogEntry[] = []
    const ShippedSub = loggingSubscriberClass('shipped-sub', log)
    const emitter = emitterOver([{ instance: new ShippedSub(), eventClass: OrderShipped }])
    emitter.onModuleInit()

    await emitter.emit({} as Transaction, [new OrderPlaced({})])

    expect(log).toEqual([])
  })

  it('does nothing for an event without subscribers or an empty list', async () => {
    const log: LogEntry[] = []
    const PlacedSub = loggingSubscriberClass('placed-sub', log)
    const emitter = emitterOver([{ instance: new PlacedSub(), eventClass: OrderPlaced }])
    emitter.onModuleInit()

    await emitter.emit({} as Transaction, [new Unheard({})])
    await emitter.emit({} as Transaction, [])

    expect(log).toEqual([])
  })

  it('does not deliver a subclass event to the parent subscribers', async () => {
    const log: LogEntry[] = []
    const PlacedSub = loggingSubscriberClass('placed-sub', log)
    const emitter = emitterOver([{ instance: new PlacedSub(), eventClass: OrderPlaced }])
    emitter.onModuleInit()

    class SpecialPlaced extends OrderPlaced {}
    await emitter.emit({} as Transaction, [new SpecialPlaced({})])

    expect(log).toEqual([])
  })

  it('propagates a subscriber error and stops later subscribers', async () => {
    const log: LogEntry[] = []
    const boom = new Error('boom')
    const B = loggingSubscriberClass('B', log)
    const emitter = emitterOver([
      { instance: new ThrowingSubscriber(boom), eventClass: OrderPlaced },
      { instance: new B(), eventClass: OrderPlaced },
    ])
    emitter.onModuleInit()

    const rejection = emitter.emit({} as Transaction, [new OrderPlaced({})])
    await expect(rejection).rejects.toThrow('boom')
    await expect(rejection).rejects.toBe(boom)
    expect(log).toEqual([])
  })

  it('rejects a subscriber without handle() at init', () => {
    const emitter = emitterOver([{ instance: {}, eventClass: OrderPlaced }])

    expect(() => emitter.onModuleInit()).toThrow(/has no handle\(\) method/)
  })

  it('skips wrappers without metadata or instance and registers the rest', async () => {
    const log: LogEntry[] = []
    const Unmarked = loggingSubscriberClass('unmarked', log)
    const PlacedSub = loggingSubscriberClass('placed-sub', log)
    const emitter = emitterOver([
      { instance: new Unmarked(), eventClass: undefined as never },
      { instance: undefined as never, eventClass: OrderPlaced },
      { instance: new PlacedSub(), eventClass: OrderPlaced },
    ])
    emitter.onModuleInit()

    await emitter.emit({} as Transaction, [new OrderPlaced({})])

    expect(log.map(([name]) => name)).toEqual(['placed-sub'])
  })

  it('rejects a request-scoped subscriber at init', () => {
    const PlacedSub = loggingSubscriberClass('placed-sub', [])
    const emitter = emitterOver([
      { instance: new PlacedSub(), eventClass: OrderPlaced, requestScoped: true },
    ])

    expect(() => emitter.onModuleInit()).toThrow(
      'placed-sub is a @Subscribe subscriber but is request-scoped',
    )
  })

  it('rejects a subscriber class discovered twice', () => {
    class Doubled {
      async handle(): Promise<void> {}
    }
    const emitter = emitterOver([
      { instance: new Doubled(), eventClass: OrderPlaced },
      { instance: new Doubled(), eventClass: OrderShipped },
    ])

    expect(() => emitter.onModuleInit()).toThrow(
      /registered as a @Subscribe subscriber more than once/,
    )
  })
})
