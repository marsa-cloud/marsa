import { Injectable } from '@nestjs/common'
import { DiscoveryService } from '@nestjs/core'
import type { JobClass } from '#src/modules/jobs/job.js'
import { JobHandler, type JobHandlerInstance } from '#src/modules/jobs/job-handler.decorator.js'

export type JobRegistration = { jobClass: JobClass; handler: JobHandlerInstance }

@Injectable()
export class JobRegistry {
  private cached?: readonly JobRegistration[]

  constructor(private readonly discovery: DiscoveryService) {}

  registrations(): readonly JobRegistration[] {
    this.cached ??= this.discover()
    return this.cached
  }

  isRegistered(queue: string): boolean {
    return this.registrations().some(({ jobClass }) => jobClass.queue === queue)
  }

  private discover(): readonly JobRegistration[] {
    const found: JobRegistration[] = []
    const wrappers = this.discovery.getProviders({ metadataKey: JobHandler.KEY })

    for (const wrapper of wrappers) {
      const handler = wrapper.instance as JobHandlerInstance | undefined
      const jobClass = this.discovery.getMetadataByDecorator(JobHandler, wrapper)
      if (!handler || !jobClass) continue

      const handlerName = handler.constructor.name
      if (typeof handler.handle !== 'function') {
        throw new Error(`${handlerName} is a @JobHandler but has no handle() method`)
      }
      if (found.some((r) => r.jobClass === jobClass)) {
        throw new Error(`Job ${jobClass.name} has more than one @JobHandler`)
      }
      const clash = found.find((r) => r.jobClass.queue === jobClass.queue)
      if (clash) {
        throw new Error(
          `Queue '${jobClass.queue}' is used by both ${clash.jobClass.name} and ${jobClass.name}`,
        )
      }
      found.push({ jobClass, handler })
    }

    return this.orderByDeadLetter(found)
  }

  private orderByDeadLetter(found: JobRegistration[]): JobRegistration[] {
    const byQueue = new Map(found.map((r) => [r.jobClass.queue, r]))
    const ordered: JobRegistration[] = []
    const done = new Set<string>()

    const visit = (registration: JobRegistration, path: string[]): void => {
      const { queue, options } = registration.jobClass
      if (done.has(queue)) return
      if (path.includes(queue)) {
        throw new Error(
          `Dead-letter cycle: ${[...path.slice(path.indexOf(queue)), queue].join(' -> ')}`,
        )
      }
      if (options.deadLetter) {
        const target = byQueue.get(options.deadLetter)
        if (!target) {
          throw new Error(
            `Job ${registration.jobClass.name} dead-letters to '${options.deadLetter}', which has no @JobHandler`,
          )
        }
        visit(target, [...path, queue])
      }
      done.add(queue)
      ordered.push(registration)
    }

    for (const registration of found) visit(registration, [])
    return ordered
  }
}
