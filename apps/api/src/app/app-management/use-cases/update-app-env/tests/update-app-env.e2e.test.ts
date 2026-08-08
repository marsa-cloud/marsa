import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { UpdateAppEnvCommandBuilder } from '#src/app/app-management/use-cases/update-app-env/update-app-env.command.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'update-env-e2e-app'

describe('PUT /api/v1/apps/:slug/env (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('replaces the stored env and flags that a redeploy is needed', async () => {
    await setup.db
      .insert(appTable)
      .values(new AppBuilder().withSlug(SLUG).withEnv({ OLD: 'value' }).build())

    const response = await request(setup.httpServer)
      .put(`/api/v1/apps/${SLUG}/env`)
      .set('Cookie', sessionCookie)
      .send(new UpdateAppEnvCommandBuilder().withEnv({ LOG_LEVEL: 'debug' }).build())
      .expect(200)

    expect(response.body).toEqual({
      slug: SLUG,
      env: { LOG_LEVEL: 'debug' },
      redeployRequired: true,
    })

    const [stored] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(stored.env).toEqual({ LOG_LEVEL: 'debug' })
  })

  it('rejects env keys that are not valid env-var names with 400', async () => {
    await request(setup.httpServer)
      .put(`/api/v1/apps/${SLUG}/env`)
      .set('Cookie', sessionCookie)
      .send({ env: { '1BAD': 'x' } })
      .expect(400)
  })

  it('returns 404 for a slug that does not exist', async () => {
    await request(setup.httpServer)
      .put('/api/v1/apps/no-such-app/env')
      .set('Cookie', sessionCookie)
      .send(new UpdateAppEnvCommandBuilder().build())
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer)
      .put(`/api/v1/apps/${SLUG}/env`)
      .send(new UpdateAppEnvCommandBuilder().build())
      .expect(401)
  })
})
