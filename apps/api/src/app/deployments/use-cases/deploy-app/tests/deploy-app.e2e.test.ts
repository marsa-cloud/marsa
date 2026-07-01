import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { DeployAppCommandBuilder } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/deployments/deploy (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('deploys a public image and returns the HTTPS URL + release status', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .send(new DeployAppCommandBuilder().withSlug('e2e-app').withImage('nginx:1.27').build())
      .expect(200)

    expect(response.body.appSlug).toBe('e2e-app')
    expect(response.body.url).toBe('https://e2e-app.demo.marsa.cc')
    // Rollout status is not read on the deploy path — the Release stays Pending
    // until the status-reconciliation follow-up (marsa#77 sub-issue).
    expect(response.body.status).toBe('pending')
    expect(typeof response.body.releaseUuid).toBe('string')
  })

  it('rejects an invalid (non-DNS-label) slug with 400', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .send(new DeployAppCommandBuilder().withSlug('Not_A_Valid_Slug').build())
      .expect(400)

    expect(String(response.body.message)).toMatch(/slug/)
  })

  it('rejects a non-string env value with 400', async () => {
    const command = new DeployAppCommandBuilder().build()

    await request(setup.httpServer)
      .post('/api/v1/deployments/deploy')
      .send({ ...command, env: { LOG_LEVEL: 1 } })
      .expect(400)
  })
})
