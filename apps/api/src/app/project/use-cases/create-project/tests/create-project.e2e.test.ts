import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/projects (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('creates a project', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'Demo', slug: 'demo' })
      .expect(201)

    expect(response.body).toMatchObject({ name: 'Demo', slug: 'demo' })
    expect(response.body.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects a duplicate slug with 409', async () => {
    await request(setup.httpServer)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'Again', slug: 'demo' })
      .expect(409)
  })

  it('rejects a slug longer than 30 characters with 400', async () => {
    await request(setup.httpServer)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'Long', slug: 'a'.repeat(31) })
      .expect(400)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).post('/api/v1/projects').send({}).expect(401)
  })
})
