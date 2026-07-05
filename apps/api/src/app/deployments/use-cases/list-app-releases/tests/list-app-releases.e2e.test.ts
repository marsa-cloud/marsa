import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { DeployAppCommandBuilder } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'releases-e2e-app'

describe('GET /api/v1/deployments/apps/:slug/releases (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()

    // Seed a release via the deploy endpoint (stays `pending` on the deploy path).
    await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .set('Cookie', sessionCookie)
      .send(new DeployAppCommandBuilder().withSlug(SLUG).withImage('nginx:1.27').build())
      .expect(200)
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists releases and reconciles the pending one to succeeded (mock rollout Complete)', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/deployments/apps/${SLUG}/releases`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(Array.isArray(response.body.releases)).toBe(true)
    expect(response.body.releases.length).toBeGreaterThanOrEqual(1)
    expect(response.body.releases[0].deployStatus).toBe('succeeded')
    expect(response.body.releases[0].imageRef).toBe('nginx:1.27')
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/deployments/apps/${SLUG}/releases`).expect(401)
  })
})
