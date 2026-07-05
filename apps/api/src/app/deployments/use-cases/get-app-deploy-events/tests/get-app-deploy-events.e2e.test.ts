import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'deploy-events-e2e-app'

describe('GET /api/v1/deployments/apps/:slug/deploy-events (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns rollout events for the app (mock backend reports one Normal event)', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/deployments/apps/${SLUG}/deploy-events`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(Array.isArray(response.body.events)).toBe(true)
    expect(response.body.events.length).toBeGreaterThanOrEqual(1)
    const first = response.body.events[0]
    expect(first.type).toBe('Normal')
    expect(first.reason).toBe('ScalingReplicaSet')
    expect(first.involvedObject).toEqual({ kind: 'Deployment', name: SLUG })
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer)
      .get(`/api/v1/deployments/apps/${SLUG}/deploy-events`)
      .expect(401)
  })
})
