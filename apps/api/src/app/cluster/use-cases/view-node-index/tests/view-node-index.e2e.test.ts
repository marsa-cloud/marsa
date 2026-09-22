import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/nodes (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists the cluster nodes with their labels and readiness', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/nodes')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toEqual([
      { name: 'mock-node-a', labels: { 'kubernetes.io/hostname': 'mock-node-a' }, ready: true },
      { name: 'mock-node-b', labels: { 'kubernetes.io/hostname': 'mock-node-b' }, ready: false },
    ])
  })

  it('rejects an unauthenticated request', async () => {
    await request(setup.httpServer).get('/api/v1/nodes').expect(401)
  })
})
