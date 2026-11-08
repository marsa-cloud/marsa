import { after, before, describe, it } from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { AppImagesDeletedDomainEvent } from '#src/app/app-management/events/app-images-deleted.event.js'
import { AppDeletionFailedJobHandler } from '#src/app/app-management/jobs/app-deletion-failed/app-deletion-failed.job-handler.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { drainJobs } from '#test/jobs/drain-jobs.js'

const SLUG = 'deletion-jobs-app'

describe('app deletion chain jobs (integration)', () => {
  let setup: TestSetup
  let sessionCookie: string
  let environment: Environment

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
  })

  after(async () => {
    await setup.teardown()
  })

  it('DELETE then drain destroys the runtime and keeps the row', async () => {
    const app = await setup.seedApp(environment.uuid, SLUG)
    const runtime = setup.app.get<AppRuntime>(AppRuntime) as MockAppRuntime

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(202)
    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(202)

    const rows = await setup.db.execute<{ count: string }>(
      sql`select count(*)::text as count from pgboss.job where name = 'destroy-app-runtime'`,
    )
    expect(Number(rows.rows[0]?.count)).toBe(1)

    await drainJobs(setup.app)

    expect(runtime.destroyed.some((ref) => ref.app.uuid === app.uuid)).toBe(true)
    const detail = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(200)
    expect(detail.body.state).toBe('deleting')
  })

  it('AppImagesDeletedDomainEvent finalizes the deletion', async () => {
    const app = await setup.seedApp(environment.uuid, 'deletion-jobs-finalize')
    await setup.db.insert(releaseTable).values(new ReleaseBuilder().withApp(app).build())

    const emitter = setup.app.get(DomainEventEmitter)
    await setup.db.transaction((tx) =>
      emitter.emit(tx, [
        new AppImagesDeletedDomainEvent({
          appUuid: app.uuid,
          slug: app.slug,
          placement: new AppPlacementBuilder().withApp(app).build(),
        }),
      ]),
    )

    await drainJobs(setup.app)

    await request(setup.httpServer)
      .get('/api/v1/apps/deletion-jobs-finalize')
      .set('Cookie', sessionCookie)
      .expect(404)
    const releases = await setup.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, app.uuid))
    expect(releases).toHaveLength(0)
  })

  it('the dead-letter handler writes the failure', async () => {
    const app = await setup.seedApp(environment.uuid, 'deletion-jobs-dead-letter')

    const handler = setup.app.get(AppDeletionFailedJobHandler)
    await handler.handle(
      {
        appUuid: app.uuid,
        slug: app.slug,
        placement: new AppPlacementBuilder().withApp(app).build(),
      },
      {
        sourceName: 'delete-app-repository',
        sourceOutput: { message: 'registry unreachable' },
      } as never,
    )

    const [row] = await setup.db.select().from(appTable).where(eq(appTable.uuid, app.uuid))
    expect(row.deletionFailedAt).not.toBeNull()
    expect(row.deletionError).toBe('delete-app-repository: registry unreachable')
  })
})
