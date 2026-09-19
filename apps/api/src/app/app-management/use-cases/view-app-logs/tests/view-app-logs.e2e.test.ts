import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { seedEnvironment } from '#src/test/fixtures/seed-environment.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'run-logs-e2e-app'

describe('GET /api/v1/apps/:slug/logs (e2e)', () => {
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

  it('returns a run-log snapshot (mock backend)', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/logs`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.podName).toBe('mock-pod-abc123')
    expect(typeof response.body.logs).toBe('string')
  })

  it('rejects a tailLines above the maximum with 400', async () => {
    await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/logs?tailLines=5000`)
      .set('Cookie', sessionCookie)
      .expect(400)
  })

  it('returns 404 for an unknown app', async () => {
    await request(setup.httpServer)
      .get('/api/v1/apps/ghost/logs')
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/apps/${SLUG}/logs`).expect(401)
  })
})
