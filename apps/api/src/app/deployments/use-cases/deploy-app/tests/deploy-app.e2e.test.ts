import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { DeployAppCommandBuilder } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.builder.js'
import { MAX_REPLICAS } from '#src/app/deployments/use-cases/deploy-app/deploy-app.constants.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/deployments/deploy (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  // The deploy endpoint is behind SessionAuthGuard (#98), so every happy/bad
  // path below must carry a valid session cookie — the guard runs before the
  // validation pipe, so an unauthenticated request 401s before reaching it.
  // Authenticate once via the shared helper and reuse the cookie.
  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('deploys a public image and returns the HTTPS URL + release status', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .set('Cookie', sessionCookie)
      .send(new DeployAppCommandBuilder().withSlug('e2e-app').withImage('nginx:1.27').build())
      .expect(200)

    expect(response.body.appSlug).toBe('e2e-app')
    expect(response.body.url).toBe('https://e2e-app.demo.marsa.cc')
    // Rollout status is not read on the deploy path — the Release stays Pending
    // until the refresh-on-read reconciliation on the list endpoint (marsa#100).
    expect(response.body.deployStatus).toBe('pending')
    expect(typeof response.body.releaseUuid).toBe('string')
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .send(new DeployAppCommandBuilder().withSlug('no-session-app').build())
      .expect(401)
  })

  it('rejects an invalid (non-DNS-label) slug with 400', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .set('Cookie', sessionCookie)
      .send(new DeployAppCommandBuilder().withSlug('Not_A_Valid_Slug').build())
      .expect(400)

    expect(String(response.body.message)).toMatch(/slug/)
  })

  it('rejects a non-string env value with 400', async () => {
    const command = new DeployAppCommandBuilder().build()

    await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .set('Cookie', sessionCookie)
      .send({ ...command, env: { LOG_LEVEL: 1 } })
      .expect(400)
  })

  it('rejects an invalid env-var-name key with 400', async () => {
    const command = new DeployAppCommandBuilder().build()

    await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .set('Cookie', sessionCookie)
      .send({ ...command, env: { '1INVALID': 'x' } })
      .expect(400)
  })

  it('rejects a replica count above the maximum with 400', async () => {
    const command = new DeployAppCommandBuilder().build()

    await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .set('Cookie', sessionCookie)
      .send({ ...command, replicas: MAX_REPLICAS + 1 })
      .expect(400)
  })
})
