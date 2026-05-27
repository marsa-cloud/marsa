import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/status (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns api info', async () => {
    const response = await request(setup.httpServer).get('/api/v1/status').expect(200)

    expect(response.body.name).toBe('marsa-api')
    expect(typeof response.body.version).toBe('string')
    expect(typeof response.body.uptimeSeconds).toBe('number')
  })
})
