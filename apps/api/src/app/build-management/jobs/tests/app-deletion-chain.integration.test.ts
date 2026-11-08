import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { replace } from 'sinon'
import request from 'supertest'
import {appTable } from '#src/app/app-management/entities/app.table.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { buildTable } from '#src/app/build-management/entities/build.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { drainJobs } from '#test/jobs/drain-jobs.js'

const SLUG = 'deletion-chain-app'

describe('the full app deletion chain (integration)', () => {
  let setup: TestSetup
  let sessionCookie: string
  let environment: Environment
  let registry: MockImageRegistry
  const log: string[] = []

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment

    const runtime = setup.app.get(AppRuntime)
    const builds = setup.app.get(BuildRuntime)
    registry = setup.app.get(ImageRegistry)

    const destroy = runtime.destroy.bind(runtime)
    replace(runtime, 'destroy', async (...args: Parameters<typeof destroy>) => {
      await destroy(...args)
      log.push('destroy')
    })
    const cancel = builds.cancel.bind(builds)
    replace(builds, 'cancel', async (...args: Parameters<typeof cancel>) => {
      await cancel(...args)
      log.push('cancel')
    })
    const deleteRepository = registry.deleteRepository.bind(registry)
    replace(registry, 'deleteRepository', async (...args: Parameters<typeof deleteRepository>) => {
      await deleteRepository(...args)
      log.push('registry')
    })
  })

  after(async () => {
    await setup.teardown()
  })

  it('the full chain deletes everything in order', async () => {
    const app = await setup.seedApp(environment.uuid, SLUG)
    const build = new BuildBuilder().withApp(app).build()
    await setup.db.insert(buildTable).values(build)
    await setup.db.insert(releaseTable).values(new ReleaseBuilder().withApp(app).build())

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(202)
    await drainJobs(setup.app)

    expect(log).toEqual(['destroy', 'cancel', 'registry'])
    // Cancel marks the row and finalize deletes it, so a drained chain leaves no rows.
    const builds = await setup.db.select().from(buildTable).where(eq(buildTable.appUuid, app.uuid))
    expect(builds).toHaveLength(0)
    await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(404)
    const releases = await setup.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, app.uuid))
    expect(releases).toHaveLength(0)
  })

  it('a transient registry failure converges on retry', async () => {
    const app = await setup.seedApp(environment.uuid, `${SLUG}-transient`)
    registry.failNextDelete(new Error('registry flaky'))

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}-transient`)
      .set('Cookie', sessionCookie)
      .expect(202)
    await drainJobs(setup.app)

    const rows = await setup.db.select().from(appTable).where(eq(appTable.uuid, app.uuid))
    expect(rows).toHaveLength(0)
    expect(registry.deletedRepositories).toContain(`${SLUG}-transient`)
  })

  it('a permanent registry failure dead-letters, then a retry deletes', async () => {
    const app = await setup.seedApp(environment.uuid, `${SLUG}-permanent`)
    registry.failEveryDelete(new Error('registry unreachable'))
    const registrations = registry.deletedRepositories.length

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}-permanent`)
      .set('Cookie', sessionCookie)
      .expect(202)
    await drainJobs(setup.app)

    expect(registry.deletedRepositories).toHaveLength(registrations)
    const [row] = await setup.db.select().from(appTable).where(eq(appTable.uuid, app.uuid))
    expect(row).toBeDefined()
    expect(row?.deletionFailedAt).not.toBeNull()
    expect(row?.deletionError).toContain('delete-app-repository')
    expect(row?.deletionError).toContain('registry unreachable')
    const detail = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}-permanent`)
      .set('Cookie', sessionCookie)
      .expect(200)
    expect(detail.body.state).toBe('deletion_failed')

    registry.clearDeleteFailures()
    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}-permanent`)
      .set('Cookie', sessionCookie)
      .expect(202)
    await drainJobs(setup.app)

    expect(registry.deletedRepositories).toContain(`${SLUG}-permanent`)
    await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}-permanent`)
      .set('Cookie', sessionCookie)
      .expect(404)
  })
})
