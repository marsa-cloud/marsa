import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'redeploy-e2e-app'

describe('POST /api/v1/apps/:slug/redeploy (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string
  let seededReleaseUuid: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()

    const app = new AppBuilder().withSlug(SLUG).withImage('nginx:1.27').build()
    const release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(releaseTable).values(release)
    seededReleaseUuid = release.uuid
  })

  after(async () => {
    await setup.teardown()
  })

  it('creates a new Release for the stored app and returns its public URL', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/redeploy`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.appSlug).toBe(SLUG)
    expect(response.body.url).toBe(`https://${SLUG}.demo.marsa.cc`)
    expect(response.body.deployStatus).toBe('pending')
    expect(response.body.releaseUuid).not.toBe(seededReleaseUuid)

    const releases = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/releases`)
      .set('Cookie', sessionCookie)
      .expect(200)
    expect(releases.body.releases.length).toBe(2)
    expect(releases.body.releases[0].uuid).toBe(response.body.releaseUuid)
  })

  it('rejects an unknown slug with 404', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps/no-such-app/redeploy')
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).post(`/api/v1/apps/${SLUG}/redeploy`).expect(401)
  })
})
