import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'deploy-release-e2e'

describe('POST /api/v1/releases/:uuid/deploy (e2e)', () => {
  let setup: TestSetup
  let cookie: string
  let olderUuid: string
  let newestUuid: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    const app = new AppBuilder().withSlug(SLUG).build()
    const older = new ReleaseBuilder().withApp(app).withDeployStatus(DeployStatus.Succeeded).build()
    const newest = new ReleaseBuilder().withApp(app).build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(releaseTable).values([older, newest])
    olderUuid = older.uuid
    newestUuid = newest.uuid
  })

  after(async () => {
    await setup.teardown()
  })

  it('deploys the newest release, and is idempotent', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await request(setup.httpServer)
        .post(`/api/v1/releases/${newestUuid}/deploy`)
        .set('Cookie', cookie)
        .expect(200)
      expect(response.body).toEqual({
        releaseUuid: newestUuid,
        appSlug: SLUG,
        url: `https://${SLUG}.demo.marsa.cc`,
        deployStatus: 'pending',
      })
    }
  })

  it('refuses an older release with 409', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/releases/${olderUuid}/deploy`)
      .set('Cookie', cookie)
      .expect(409)
  })

  it('returns 404 for an unknown uuid, 400 for a malformed one, 401 without a session', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/releases/${new ReleaseBuilder().build().uuid}/deploy`)
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer)
      .post('/api/v1/releases/nope/deploy')
      .set('Cookie', cookie)
      .expect(400)
    await request(setup.httpServer).post(`/api/v1/releases/${newestUuid}/deploy`).expect(401)
  })
})
