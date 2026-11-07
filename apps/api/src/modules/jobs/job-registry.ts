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

  owns(jobClass: JobClass): boolean {
    return this.registrations().some(({ jobClass: owner }) => owner === jobClass)
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

    for (const { jobClass } of found) {
      const target = jobClass.options.deadLetter
      if (target && !found.some((r) => r.jobClass.queue === target)) {
        throw new Error(
          `Job ${jobClass.name} dead-letters to '${target}', which has no @JobHandler`,
        )
      }
    }

    const deadLetterTargets = new Set(found.map((r) => r.jobClass.options.deadLetter))
    const isTarget = (r: JobRegistration) => deadLetterTargets.has(r.jobClass.queue)
    return [...found.filter(isTarget), ...found.filter((r) => !isTarget(r))]
  }
}
