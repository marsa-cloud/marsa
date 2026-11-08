import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'delete-e2e-app'

describe('DELETE /api/v1/apps/:slug (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
  })

  after(async () => {
    await setup.teardown()
  })

  it('schedules the deletion, keeping the row in the deleting state', async () => {
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(SLUG).build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(releaseTable).values(new ReleaseBuilder().withApp(app).build())

    const response = await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(202)

    expect(response.text).toBe('')
    const [kept] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(kept.deletionRequestedAt).not.toBeNull()

    const detail = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(200)
    expect(detail.body.state).toBe('deleting')
    const releases = await setup.db.select().from(releaseTable)
    expect(releases).toHaveLength(1)
  })

  it('answers 202 for a second delete of an already-deleting app', async () => {
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('delete-e2e-deleting')
      .withDeletionRequested()
      .build()
    await setup.db.insert(appTable).values(app)

    await request(setup.httpServer)
      .delete('/api/v1/apps/delete-e2e-deleting')
      .set('Cookie', sessionCookie)
      .expect(202)
  })

  it('returns 404 for a slug that does not exist', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/apps/no-such-app')
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).delete(`/api/v1/apps/${SLUG}`).expect(401)
  })
})
