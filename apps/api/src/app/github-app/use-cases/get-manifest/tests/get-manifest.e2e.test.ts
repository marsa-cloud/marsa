import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/github-app/manifest (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns a manifest, form action and state', async () => {
    const response = await request(setup.httpServer).get('/api/v1/github-app/manifest').expect(200)

    expect(response.body.manifest.url).toBe('https://demo.marsa.cc')
    expect(response.body.manifest.public).toBe(false)
    expect(response.body.formAction).toContain('github.com/settings/apps/new')
    expect(typeof response.body.state).toBe('string')
  })
})
