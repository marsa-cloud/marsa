import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'health-e2e-app'

describe('GET /api/v1/deployments/apps/:slug/health (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns the live health verdict (mock backend reports healthy)', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/deployments/apps/${SLUG}/health`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.status).toBe('healthy')
    expect(response.body.availableReplicas).toBe(1)
    expect(response.body.desiredReplicas).toBe(1)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/deployments/apps/${SLUG}/health`).expect(401)
  })
})
