import { describe, it } from 'node:test'
import type { DiscoveryService } from '@nestjs/core'
import { expect } from 'expect'
import { Job, type JobClass } from '#src/modules/jobs/job.js'
import { JobRegistry } from '#src/modules/jobs/job-registry.js'

type Stub = { instance: object | null; jobClass: JobClass }

function registryOver(stubs: Stub[]): JobRegistry {
  const discovery = {
    getProviders: () =>
      stubs.map((s) => ({ instance: s.instance, metatype: s.instance?.constructor, s })),
    getMetadataByDecorator: (_decorator: unknown, wrapper: { s: Stub }) => wrapper.s.jobClass,
  } as unknown as DiscoveryService
  return new JobRegistry(discovery)
}

function jobClass(name: string, queue: string, options: JobClass['options'] = {}): JobClass {
  const cls = class extends Job<object> {
    static readonly queue = queue
    static readonly options = options
  }
  Object.defineProperty(cls, 'name', { value: name })
  return cls
}

class HandlerA {
  async handle(): Promise<void> {}
}
class HandlerB {
  async handle(): Promise<void> {}
}
class BrokenHandler {}

describe('JobRegistry', () => {
  it('lists one registration per @JobHandler provider', () => {
    const jobA = jobClass('JobA', 'a-q')
    const jobB = jobClass('JobB', 'b-q')
    const handlerA = new HandlerA()
    const handlerB = new HandlerB()

    const registrations = registryOver([
      { instance: handlerA, jobClass: jobA },
      { instance: handlerB, jobClass: jobB },
    ]).registrations()

    expect(registrations).toEqual([
      { jobClass: jobA, handler: handlerA },
      { jobClass: jobB, handler: handlerB },
    ])
  })

  it('puts dead-letter target queues first', () => {
    const failing = jobClass('FailingJob', 'failing-q', { deadLetter: 'dead-letter-q' })
    const dead = jobClass('DeadJob', 'dead-letter-q')

    const queues = registryOver([
      { instance: new HandlerA(), jobClass: failing },
      { instance: new HandlerB(), jobClass: dead },
    ])
      .registrations()
      .map((r) => r.jobClass.queue)

    expect(queues).toEqual(['dead-letter-q', 'failing-q'])
  })

  it('ignores providers that are not instantiated', () => {
    const registry = registryOver([{ instance: null, jobClass: jobClass('JobA', 'a-q') }])

    expect(registry.registrations()).toEqual([])
  })

  it('rejects two job classes on one queue', () => {
    const registry = registryOver([
      { instance: new HandlerA(), jobClass: jobClass('JobA', 'dup-q') },
      { instance: new HandlerB(), jobClass: jobClass('JobB', 'dup-q') },
    ])

    expect(() => registry.registrations()).toThrow("Queue 'dup-q' is used by both JobA and JobB")
  })

  it('rejects two handlers for one job', () => {
    const job = jobClass('JobA', 'a-q')
    const registry = registryOver([
      { instance: new HandlerA(), jobClass: job },
      { instance: new HandlerB(), jobClass: job },
    ])

    expect(() => registry.registrations()).toThrow(/Job JobA has more than one @JobHandler/)
  })

  it('rejects a handler without handle()', () => {
    const registry = registryOver([
      { instance: new BrokenHandler(), jobClass: jobClass('JobA', 'a-q') },
    ])

    expect(() => registry.registrations()).toThrow(/BrokenHandler.*has no handle\(\) method/)
  })

  it('isRegistered reflects discovered queues', () => {
    const registry = registryOver([{ instance: new HandlerA(), jobClass: jobClass('JobA', 'a-q') }])

    expect(registry.isRegistered('a-q')).toBe(true)
    expect(registry.isRegistered('nope')).toBe(false)
  })
})
