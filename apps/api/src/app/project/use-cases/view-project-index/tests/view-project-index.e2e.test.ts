import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/projects (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    await setup.db
      .insert(projectTable)
      .values([
        new ProjectBuilder().withSlug('alpha').withName('Alpha').build(),
        new ProjectBuilder().withSlug('beta').withName('Beta').build(),
      ])
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists projects newest first', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/projects')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items.map((p: { slug: string }) => p.slug)).toEqual(['beta', 'alpha'])
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/projects').expect(401)
  })
})
