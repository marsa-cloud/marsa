import { afterEach, describe, it, mock } from 'node:test'
import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import type { Job as PgBossJob, PgBoss } from 'pg-boss'
import { Job, type JobClass } from '#src/modules/jobs/job.js'
import { JobQueueLifecycle } from '#src/modules/jobs/job-queue.lifecycle.js'
import type { JobRegistration, JobRegistry } from '#src/modules/jobs/job-registry.js'

function jobClass(queue: string, extra: Partial<JobClass> = {}): JobClass {
  const cls = class extends Job<object> {}
  return Object.assign(cls, { queue, options: {}, ...extra })
}

type WorkCallback = (jobs: PgBossJob<object>[]) => Promise<void>

function build(registrations: JobRegistration[], enabled: boolean) {
  const log: string[] = []
  const queueOptions: Record<string, unknown> = {}
  const scheduled: Array<[string, string]> = []
  const workCalls: Array<{ queue: string; options: unknown; callback: WorkCallback }> = []
  const stops: unknown[] = []
  const boss = {
    start: () => Promise.resolve(void log.push('start')),
    createQueue: (queue: string, options: unknown) => {
      log.push(`createQueue:${queue}`)
      queueOptions[queue] = options
      return Promise.resolve()
    },
    schedule: (queue: string, cron: string) => Promise.resolve(void scheduled.push([queue, cron])),
    work: (queue: string, options: unknown, callback: WorkCallback) =>
      Promise.resolve(void workCalls.push({ queue, options, callback })),
    stop: (options: unknown) => Promise.resolve(void stops.push(options)),
  } as unknown as PgBoss
  const registry = { registrations: () => registrations } as unknown as JobRegistry
  const config = { getOrThrow: () => enabled } as unknown as ConfigService
  return {
    lifecycle: new JobQueueLifecycle(boss, registry, config),
    log,
    queueOptions,
    scheduled,
    workCalls,
    stops,
  }
}

const noopHandler = { handle: () => Promise.resolve() }

describe('JobQueueLifecycle', () => {
  afterEach(() => mock.restoreAll())

  it('starts pg-boss before creating queues, in registry order', async () => {
    const dlq = jobClass('dead-letter-q', { options: { retryLimit: 0 } })
    const failing = jobClass('failing-q', { options: { deadLetter: 'dead-letter-q' } })
    const { lifecycle, log, queueOptions } = build(
      [
        { jobClass: dlq, handler: noopHandler },
        { jobClass: failing, handler: noopHandler },
      ],
      false,
    )

    await lifecycle.onApplicationBootstrap()

    expect(log).toEqual(['start', 'createQueue:dead-letter-q', 'createQueue:failing-q'])
    expect(queueOptions['failing-q']).toEqual({ deadLetter: 'dead-letter-q' })
  })

  it('schedules jobs that declare a cron, even with workers off', async () => {
    const cron = jobClass('cron-q', { schedule: '0 * * * *' })
    const { lifecycle, scheduled } = build([{ jobClass: cron, handler: noopHandler }], false)

    await lifecycle.onApplicationBootstrap()

    expect(scheduled).toEqual([['cron-q', '0 * * * *']])
  })

  it('works every queue only when workers are enabled', async () => {
    const regs = [
      { jobClass: jobClass('a-q'), handler: noopHandler },
      { jobClass: jobClass('b-q'), handler: noopHandler },
    ]
    const on = build(regs, true)
    const off = build(regs, false)

    await on.lifecycle.onApplicationBootstrap()
    await off.lifecycle.onApplicationBootstrap()

    expect(on.workCalls.map((c) => c.queue)).toEqual(['a-q', 'b-q'])
    expect(on.workCalls.every((c) => JSON.stringify(c.options) === '{"batchSize":1}')).toBe(true)
    expect(off.workCalls).toHaveLength(0)
  })

  it('logs and rethrows a handler failure', async () => {
    const error = mock.method(Logger.prototype, 'error', () => {})
    const failing = {
      jobClass: jobClass('failing-q'),
      handler: {
        handle: () => Promise.reject(new Error('boom')),
      },
    }
    const { lifecycle, workCalls } = build([failing], true)
    await lifecycle.onApplicationBootstrap()

    const job = { id: 'j1', data: {} } as PgBossJob<object>
    await expect(workCalls[0].callback([job])).rejects.toThrow('boom')

    expect(String(error.mock.calls[0].arguments[0])).toContain('failing-q j1: boom')
  })

  it('stops pg-boss gracefully before shutdown', async () => {
    const { lifecycle, stops } = build([], true)

    await lifecycle.beforeApplicationShutdown()

    expect(stops).toEqual([{ graceful: true }])
  })
})
