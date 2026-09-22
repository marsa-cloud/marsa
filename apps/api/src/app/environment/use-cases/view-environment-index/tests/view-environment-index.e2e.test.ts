import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/projects/:projectSlug/environments (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    const demo = new ProjectBuilder().withSlug('demo').build()
    const other = new ProjectBuilder().withSlug('other').build()
    await setup.db.insert(projectTable).values([demo, other])
    await setup.db
      .insert(environmentTable)
      .values([
        new EnvironmentBuilder().withProject(demo).withSlug('dev').build(),
        new EnvironmentBuilder().withProject(other).withSlug('prod').build(),
      ])
  })

  after(async () => {
    await setup.teardown()
  })

  it("lists only that project's environments with their namespaces", async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/projects/demo/environments')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({ slug: 'dev', namespace: 'demo-dev' })
  })

  it('returns 404 for an unknown project and 401 without a session', async () => {
    await request(setup.httpServer)
      .get('/api/v1/projects/ghost/environments')
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer).get('/api/v1/projects/demo/environments').expect(401)
  })
})
