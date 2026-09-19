import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { seedEnvironment } from '#src/test/fixtures/seed-environment.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'health-e2e-app'

describe('GET /api/v1/apps/:slug/health (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    const { environment } = await seedEnvironment(setup.db)
    await setup.db
      .insert(appTable)
      .values(new AppBuilder().withSlug(SLUG).withEnvironment(environment).build())
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns the live health verdict (mock backend reports healthy)', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/health`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.status).toBe('healthy')
    expect(response.body.availableReplicas).toBe(1)
    expect(response.body.desiredReplicas).toBe(1)
  })

  it('returns 404 for an unknown app', async () => {
    await request(setup.httpServer)
      .get('/api/v1/apps/ghost/health')
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/apps/${SLUG}/health`).expect(401)
  })
})
