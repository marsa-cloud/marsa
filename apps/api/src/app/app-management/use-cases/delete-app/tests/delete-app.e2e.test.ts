import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { DeployAppCommandBuilder } from '#src/app/release/use-cases/deploy-app/deploy-app.command.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'delete-e2e-app'

describe('DELETE /api/v1/apps/:slug (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('removes the app and its releases', async () => {
    await request(setup.httpServer)
      .post('/api/v1/deploy')
      .set('Cookie', sessionCookie)
      .send(new DeployAppCommandBuilder().withSlug(SLUG).build())
      .expect(200)

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(204)

    const apps = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(apps).toHaveLength(0)
    const releases = await setup.db.select().from(releaseTable)
    expect(releases).toHaveLength(0)
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
