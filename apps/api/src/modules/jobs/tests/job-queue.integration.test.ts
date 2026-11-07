import { afterEach, before, describe, it } from 'node:test'
import { expect } from 'expect'
import type { PgBoss } from 'pg-boss'
import { DATABASE } from '#src/modules/database/database.tokens.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { PG_BOSS } from '#src/modules/jobs/job-queue.tokens.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'
import {
  calls,
  ChainJob,
  EchoJob,
  FailingJob,
  FlakyJob,
  TestJobsModule,
} from '#src/modules/jobs/tests/test-jobs.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { drainJobs } from '#test/jobs/drain-jobs.js'

describe('job queue (integration)', () => {
  let setup: TestSetup
  let db: Database
  let boss: PgBoss
  let scheduler: JobScheduler

  before(async () => {
    setup = await TestBench.setupModuleTest(TestJobsModule)
    db = setup.testModule.get<Database>(DATABASE)
    boss = setup.testModule.get<PgBoss>(PG_BOSS)
    scheduler = setup.testModule.get(JobScheduler)
  })

  afterEach(async () => {
    await setup.teardown()
    for (const key of Object.keys(calls)) delete calls[key]
  })

  it('runs a job sent in a committed transaction', async () => {
    await db.transaction((tx) => scheduler.send(tx, new EchoJob({ n: 1 })))

    await drainJobs(setup.app)

    expect(calls['test-echo']).toEqual([{ n: 1 }])
  })

  it('leaves no job behind when the transaction rolls back', async () => {
    await expect(
      db.transaction(async (tx) => {
        await scheduler.send(tx, new EchoJob({ n: 1 }))
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')

    expect(await boss.findJobs('test-echo')).toEqual([])
    await drainJobs(setup.app)
    expect(calls['test-echo'] ?? []).toEqual([])
  })

  it('drains jobs sent by jobs', async () => {
    await db.transaction((tx) => scheduler.send(tx, new ChainJob({ n: 1 })))

    await drainJobs(setup.app)

    expect(calls['test-echo']).toEqual([{ n: 2 }])
  })

  it('retries a failing job without waiting out its delay', async () => {
    await db.transaction((tx) => scheduler.send(tx, new FlakyJob({ n: 1 })))

    await drainJobs(setup.app)

    expect(calls['test-flaky']).toEqual([{ n: 1 }])
    const jobs = await boss.findJobs('test-flaky')
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.state).toBe('completed')
  })

  it('dead-letters a job after its retries are spent', async () => {
    await db.transaction((tx) => scheduler.send(tx, new FailingJob({ n: 7 })))

    await drainJobs(setup.app)

    expect(calls['test-dead-letter']).toEqual([{ n: 7 }])
    const jobs = await boss.findJobs('test-failing')
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.state).toBe('failed')
    expect(jobs[0]?.retryCount).toBe(2)
  })

  it('registers declared crons', async () => {
    const schedule = await boss.getSchedule('test-cron')

    expect(schedule?.cron).toBe('0 3 * * *')
  })

  it('teardown removes jobs', async () => {
    await db.transaction((tx) => scheduler.send(tx, new EchoJob({ n: 1 })))
    expect(await boss.findJobs('test-echo')).toHaveLength(1)

    await setup.teardown()

    expect(await boss.findJobs('test-echo')).toEqual([])
  })
})
