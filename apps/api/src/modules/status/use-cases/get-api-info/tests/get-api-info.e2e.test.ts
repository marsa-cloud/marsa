import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import request from 'supertest'

import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/status (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await TestBench.teardown()
  })

  it('returns api info', async () => {
    const response = await request(setup.httpServer).get('/api/v1/status').expect(200)

    assert.equal(response.body.name, 'marsa-api')
    assert.equal(typeof response.body.version, 'string')
    assert.equal(typeof response.body.uptimeSeconds, 'number')
  })
})
