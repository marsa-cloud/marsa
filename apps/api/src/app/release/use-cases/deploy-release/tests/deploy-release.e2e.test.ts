import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'deploy-release-e2e'
const BARE_SLUG = 'deploy-release-e2e-bare'

describe('POST /api/v1/apps/:slug/deploy (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let cookie: string
  let newestUuid: ReleaseUuid

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(SLUG).build()
    const older = new ReleaseBuilder().withApp(app).withDeployStatus(DeployStatus.Succeeded).build()
    const newest = new ReleaseBuilder().withApp(app).build()
    await setup.db
      .insert(appTable)
      .values([
        app,
        new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(BARE_SLUG).build(),
      ])
    await setup.db.insert(releaseTable).values([older, newest])
    newestUuid = newest.uuid
  })

  after(async () => {
    await setup.teardown()
  })

  it('deploys the newest release', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/deploy`)
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body).toEqual({
      releaseUuid: newestUuid,
      appSlug: SLUG,
      url: `https://${SLUG}.demo.marsa.cc`,
      deployStatus: 'pending',
    })
    const [row] = await setup.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.uuid, newestUuid))
    expect(row.deployStatus).toBe('pending')
  })

  it('refuses an app with no release with 409', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/apps/${BARE_SLUG}/deploy`)
      .set('Cookie', cookie)
      .expect(409)
  })

  it('returns 404 for an unknown app and 401 without a session', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps/ghost/deploy')
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer).post(`/api/v1/apps/${SLUG}/deploy`).expect(401)
  })
})
