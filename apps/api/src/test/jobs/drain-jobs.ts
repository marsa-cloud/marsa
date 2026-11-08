import type { INestApplicationContext } from '@nestjs/common'
import type { PgBoss } from 'pg-boss'
import { PG_BOSS } from '#src/modules/jobs/job-queue.tokens.js'
import { JobRegistry } from '#src/modules/jobs/job-registry.js'

const MAX_DRAIN_PASSES = 100

export async function drainJobs(app: INestApplicationContext): Promise<void> {
  const boss = app.get<PgBoss>(PG_BOSS)
  const registrations = app.get(JobRegistry).registrations()

  for (let pass = 0; pass < MAX_DRAIN_PASSES; pass++) {
    let ran = 0
    for (const { jobClass, handler } of registrations) {
      const queue = jobClass.queue
      for (;;) {
        const [job] = await boss.fetch<object>(queue, {
          batchSize: 1,
          ignoreStartAfter: true,
          includeMetadata: true,
        })
        if (!job) break
        ran++
        try {
          await handler.handle(job.data, job)
          await boss.complete(queue, job.id)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await boss.fail(queue, job.id, { message })
        }
      }
    }
    if (ran === 0) return
  }

  throw new Error(`drainJobs: queues still busy after ${MAX_DRAIN_PASSES} passes`)
}
