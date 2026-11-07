import { describe, it } from 'node:test'
import { expect } from 'expect'
import type { PgBoss } from 'pg-boss'
import type { Transaction } from '#src/modules/database/drizzle.factory.js'
import { Job } from '#src/modules/jobs/job.js'
import type { JobRegistry } from '#src/modules/jobs/job-registry.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'

class EchoJob extends Job<{ n: number }> {
  static readonly queue = 'echo-q'
  static readonly options = { retryLimit: 3, deadLetter: 'dlq', policy: 'singleton' } as const
}

class ImpostorJob extends Job<{ evil: string }> {
  static readonly queue = 'echo-q'
  static readonly options = {} as const
}

type SendCall = { queue: string; data: unknown; options: Record<string, unknown> }

function schedulerOver(owned: boolean) {
  const calls: SendCall[] = []
  const boss = {
    send: (queue: string, data: unknown, options: Record<string, unknown>) => {
      calls.push({ queue, data, options })
      return Promise.resolve('job-id')
    },
  } as unknown as PgBoss
  const registry = { owns: () => owned } as unknown as JobRegistry
  return { scheduler: new JobScheduler(boss, registry), calls }
}

const fakeTx = { execute: () => Promise.resolve({ rows: [] }) } as unknown as Transaction

describe('JobScheduler', () => {
  it('sends the payload with the class options and a drizzle adapter', async () => {
    const { scheduler, calls } = schedulerOver(true)

    const id = await scheduler.send(fakeTx, new EchoJob({ n: 1 }))

    expect(id).toBe('job-id')
    expect(calls).toHaveLength(1)
    expect(calls[0].queue).toBe('echo-q')
    expect(calls[0].data).toEqual({ n: 1 })
    expect(calls[0].options).toMatchObject({ retryLimit: 3, deadLetter: 'dlq' })
    expect(calls[0].options).not.toHaveProperty('policy')
    expect(typeof (calls[0].options.db as { executeSql: unknown }).executeSql).toBe('function')
  })

  it('lets overrides win over class options', async () => {
    const { scheduler, calls } = schedulerOver(true)

    await scheduler.send(fakeTx, new EchoJob({ n: 1 }), { singletonKey: 'k', retryLimit: 0 })

    expect(calls[0].options).toMatchObject({ singletonKey: 'k', retryLimit: 0 })
  })

  it('rejects a job whose queue has no handler', async () => {
    const { scheduler } = schedulerOver(false)

    await expect(scheduler.send(fakeTx, new EchoJob({ n: 1 }))).rejects.toThrow(
      /No @JobHandler registered for queue 'echo-q'/,
    )
  })

  it('rejects a different job class reusing a registered queue', async () => {
    const { scheduler } = schedulerOver(false)

    await expect(scheduler.send(fakeTx, new ImpostorJob({ evil: 'x' }))).rejects.toThrow(
      /No @JobHandler registered for queue 'echo-q'/,
    )
  })
})
