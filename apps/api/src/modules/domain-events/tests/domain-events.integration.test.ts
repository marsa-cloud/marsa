import { afterEach, before, describe, it } from 'node:test'
import { expect } from 'expect'
import type { PgBoss } from 'pg-boss'
import { DATABASE } from '#src/modules/database/database.tokens.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'
import {
  FailingEvent,
  sentBeforeFailure,
  TestDomainEventsModule,
  TestEvent,
} from '#src/modules/domain-events/tests/test-events.js'
import { PG_BOSS } from '#src/modules/jobs/job-queue.tokens.js'
import { calls } from '#src/modules/jobs/tests/test-jobs.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { drainJobs } from '#test/jobs/drain-jobs.js'

describe('domain events (integration)', () => {
  let setup: TestSetup
  let db: Database
  let boss: PgBoss
  let emitter: DomainEventEmitter

  before(async () => {
    setup = await TestBench.setupModuleTest(TestDomainEventsModule)
    db = setup.testModule.get<Database>(DATABASE)
    boss = setup.testModule.get<PgBoss>(PG_BOSS)
    emitter = setup.testModule.get(DomainEventEmitter)
  })

  afterEach(async () => {
    await setup.teardown()
    for (const key of Object.keys(calls)) delete calls[key]
    sentBeforeFailure.length = 0
  })

  it('runs a subscriber job after the transaction commits', async () => {
    await db.transaction((tx) => emitter.emit(tx, [new TestEvent({ n: 1 })]))

    await drainJobs(setup.app)

    expect(calls['test-echo']).toEqual([{ n: 1 }])
  })

  it('leaves no job when the caller rolls back after emitting', async () => {
    await expect(
      db.transaction(async (tx) => {
        await emitter.emit(tx, [new TestEvent({ n: 2 })])
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')

    expect(await boss.findJobs('test-echo')).toEqual([])
    await drainJobs(setup.app)
    expect(calls['test-echo'] ?? []).toEqual([])
  })

  it('rolls back an earlier subscriber job when a later subscriber throws', async () => {
    await expect(
      db.transaction((tx) => emitter.emit(tx, [new FailingEvent({ n: 3 })])),
    ).rejects.toThrow('subscriber failed')

    expect(sentBeforeFailure).toEqual([{ n: 3 }])
    expect(await boss.findJobs('test-echo')).toEqual([])
  })
})
