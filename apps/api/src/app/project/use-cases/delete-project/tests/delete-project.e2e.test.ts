import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { seedEnvironment } from '#src/test/fixtures/seed-environment.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('DELETE /api/v1/projects/:slug (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('deletes an empty project', async () => {
    await setup.db.insert(projectTable).values(new ProjectBuilder().withSlug('empty').build())

    await request(setup.httpServer)
      .delete('/api/v1/projects/empty')
      .set('Cookie', cookie)
      .expect(204)

    expect(
      await setup.db.select().from(projectTable).where(eq(projectTable.slug, 'empty')),
    ).toEqual([])
  })

  it('refuses a project that still has an environment with 409', async () => {
    const { project } = await seedEnvironment(setup.db)

    await request(setup.httpServer)
      .delete(`/api/v1/projects/${project.slug}`)
      .set('Cookie', cookie)
      .expect(409)
  })

  it('returns 404 for an unknown project and 401 without a session', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/projects/ghost')
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer).delete('/api/v1/projects/ghost').expect(401)
  })
})
