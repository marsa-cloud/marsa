import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { CaptureInstallationCommandBuilder } from '#src/app/github-app/use-cases/capture-installation/capture-installation.command.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/github-app/capture-installation (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('rejects an unsupported setup_action with 400 (no GitHub call)', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/github-app/capture-installation')
      .send(
        new CaptureInstallationCommandBuilder()
          .withInstallationId('777')
          .withSetupAction('request')
          .build(),
      )
      .expect(400)

    expect(String(response.body.message)).toMatch(/setup_action/)
  })

  it('rejects a missing installationId with 400', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/github-app/capture-installation')
      .send({ setupAction: 'install' })
      .expect(400)

    expect(String(response.body.message)).toMatch(/installationId/)
  })
})
