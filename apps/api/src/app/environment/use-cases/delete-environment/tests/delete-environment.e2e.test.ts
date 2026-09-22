import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('DELETE /api/v1/projects/:projectSlug/environments/:environmentSlug (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('refuses while an app lives there, then deletes once it is empty', async () => {
    const { project, environment } = await setup.seedEnvironment()
    const app = new AppBuilder()
      .withSlug('env-delete-e2e')
      .withEnvironmentUuid(environment.uuid)
      .build()
    await setup.db.insert(appTable).values(app)
    const url = `/api/v1/projects/${project.slug}/environments/${environment.slug}`

    await request(setup.httpServer).delete(url).set('Cookie', cookie).expect(409)

    await setup.db.delete(appTable).where(eq(appTable.uuid, app.uuid))
    await request(setup.httpServer).delete(url).set('Cookie', cookie).expect(204)

    const rows = await setup.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.uuid, environment.uuid))
    expect(rows).toEqual([])
  })

  it('returns 404 for an unknown environment and 401 without a session', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/projects/ghost/environments/dev')
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer).delete('/api/v1/projects/ghost/environments/dev').expect(401)
  })

  it('keeps the environment when the runtime cannot remove it', async () => {
    const project = new ProjectBuilder().withSlug('keep-env').build()
    const environment = new EnvironmentBuilder().withProject(project).withSlug('dev').build()
    await setup.db.insert(projectTable).values(project)
    await setup.db.insert(environmentTable).values(environment)
    setup.testModule
      .get<EnvironmentRuntime, MockEnvironmentRuntime>(EnvironmentRuntime)
      .failNext('destroy', new Error('cluster down'))

    await request(setup.httpServer)
      .delete(`/api/v1/projects/${project.slug}/environments/${environment.slug}`)
      .set('Cookie', cookie)
      .expect(502)

    const rows = await setup.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.uuid, environment.uuid))
    expect(rows).toHaveLength(1)
  })
})
