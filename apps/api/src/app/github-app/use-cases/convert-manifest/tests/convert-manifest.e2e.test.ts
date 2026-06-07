import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/github-app/conversions (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('rejects an invalid state with 400 (no GitHub call)', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/github-app/conversions')
      .send({ code: 'whatever', state: 'invalid' })
      .expect(400)

    expect(response.body.message).toMatch(/state/)
  })

  it('rejects a missing code with 400 even when state is valid', async () => {
    const manifest = await request(setup.httpServer).get('/api/v1/github-app/manifest').expect(200)

    await request(setup.httpServer)
      .post('/api/v1/github-app/conversions')
      .send({ code: '', state: manifest.body.state })
      .expect(400)
  })
})
