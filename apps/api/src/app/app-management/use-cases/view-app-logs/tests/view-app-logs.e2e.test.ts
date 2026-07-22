import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'run-logs-e2e-app'

describe('GET /api/v1/apps/:slug/logs (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
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

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/apps/${SLUG}/logs`).expect(401)
  })
})
