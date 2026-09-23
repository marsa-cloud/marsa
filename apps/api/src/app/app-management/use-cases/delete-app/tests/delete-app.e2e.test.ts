import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import type { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'delete-e2e-app'

describe('DELETE /api/v1/apps/:slug (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
  })

  after(async () => {
    await setup.teardown()
  })

  it('removes the app and its releases', async () => {
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(SLUG).build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(buildTable).values(new BuildBuilder().withApp(app).build())
    await setup.db.insert(releaseTable).values(new ReleaseBuilder().withApp(app).build())

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(204)

    const apps = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(apps).toHaveLength(0)
    const releases = await setup.db.select().from(releaseTable)
    expect(releases).toHaveLength(0)
    expect(await setup.db.select().from(buildTable)).toHaveLength(0)
    const imageRegistry = setup.testModule.get<ImageRegistry, MockImageRegistry>(ImageRegistry)
    expect(imageRegistry.deletedRepositories).toContain(SLUG)
  })

  it('returns 404 for a slug that does not exist', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/apps/no-such-app')
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).delete(`/api/v1/apps/${SLUG}`).expect(401)
  })

  it('keeps the app and its releases when the runtime cannot remove it', async () => {
    const slug = 'delete-e2e-stuck'
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(releaseTable).values(new ReleaseBuilder().withApp(app).build())
    setup.testModule
      .get<AppRuntime, MockAppRuntime>(AppRuntime)
      .failNext('destroy', new Error('cluster down'))

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${slug}`)
      .set('Cookie', sessionCookie)
      .expect(502)

    const apps = await setup.db.select().from(appTable).where(eq(appTable.slug, slug))
    expect(apps).toHaveLength(1)
    const releases = await setup.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, app.uuid))
    expect(releases).toHaveLength(1)
  })

  it('keeps the app when its registry repository cannot be deleted', async () => {
    const slug = 'delete-e2e-registry-down'
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build()
    await setup.db.insert(appTable).values(app)
    setup.testModule
      .get<ImageRegistry, MockImageRegistry>(ImageRegistry)
      .failNextDelete(new Error('registry down'))

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${slug}`)
      .set('Cookie', sessionCookie)
      .expect(502)

    const apps = await setup.db.select().from(appTable).where(eq(appTable.slug, slug))
    expect(apps).toHaveLength(1)
  })
})
