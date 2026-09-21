import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/projects/:projectSlug/environments (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    await setup.db.insert(projectTable).values(new ProjectBuilder().withSlug('demo').build())
  })

  after(async () => {
    await setup.teardown()
  })

  const post = (slug: string) =>
    request(setup.httpServer)
      .post('/api/v1/projects/demo/environments')
      .set('Cookie', cookie)
      .send({ name: 'Dev', slug })

  it('creates the environment and reports its namespace', async () => {
    const response = await post('dev').expect(201)

    expect(response.body).toMatchObject({ slug: 'dev', namespace: 'demo-dev', projectSlug: 'demo' })
  })

  it('rejects a duplicate slug in the same project with 409', async () => {
    await post('dev').expect(409)
  })

  it('rolls the row back when the namespace cannot be created', async () => {
    setup.testModule
      .get<NamespaceBackend, MockNamespaceBackend>(NamespaceBackend)
      .failNextProvision(new Error('cluster down'))

    await post('staging').expect(502)

    const rows = await setup.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.slug, 'staging'))
    expect(rows).toEqual([])
  })

  it('returns 404 for an unknown project, 400 for a bad slug, 401 without a session', async () => {
    await request(setup.httpServer)
      .post('/api/v1/projects/ghost/environments')
      .set('Cookie', cookie)
      .send({ name: 'Dev', slug: 'dev' })
      .expect(404)
    await post('Not_A_Label').expect(400)
    await request(setup.httpServer).post('/api/v1/projects/demo/environments').send({}).expect(401)
  })
})
