import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'
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

  it('creates the environment', async () => {
    const response = await post('dev').expect(201)

    expect(response.body).toMatchObject({ slug: 'dev', projectSlug: 'demo' })
    expect(response.body).not.toHaveProperty('namespace')
  })

  it('rejects a duplicate slug in the same project with 409', async () => {
    await post('dev').expect(409)
  })

  it('maps a runtime environment conflict to 409', async () => {
    setup.testModule
      .get<EnvironmentRuntime, MockEnvironmentRuntime>(EnvironmentRuntime)
      .failNext('provision', new EnvironmentConflictError('Taken by another environment.'))

    const response = await post('qa').expect(409)

    expect(response.body).toMatchObject({ message: 'Taken by another environment.' })
  })

  it('rolls the row back when the environment cannot be provisioned', async () => {
    setup.testModule
      .get<EnvironmentRuntime, MockEnvironmentRuntime>(EnvironmentRuntime)
      .failNext('provision', new Error('cluster down'))

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
