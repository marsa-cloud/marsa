import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'create-release-e2e'

describe('POST /api/v1/apps/:slug/releases (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let cookie: string
  let oldUuid: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
    const old = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(SLUG)
      .withImage('nginx:1.27')
      .withEnv({ OLD: '1' })
      .build()
    await setup.db.insert(appTable).values({ ...old, image: 'nginx:1.28', env: { NEW: '1' } })
    const release = new ReleaseBuilder().withApp(old).build()
    await setup.db.insert(releaseTable).values(release)
    oldUuid = release.uuid
  })

  after(async () => {
    await setup.teardown()
  })

  it('creates a pending release from the current config without deploying', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/releases`)
      .set('Cookie', cookie)
      .send({})
      .expect(201)

    expect(response.body).toMatchObject({
      appSlug: SLUG,
      triggeredBy: 'manual',
      sourceReleaseUuid: null,
    })
    const [row] = await setup.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.uuid, response.body.releaseUuid))
    expect(row).toMatchObject({
      imageRef: 'nginx:1.28',
      env: { NEW: '1' },
      deployStatus: 'pending',
    })
  })

  it('rolls back: copies the old snapshot and restores it onto the app', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/releases`)
      .set('Cookie', cookie)
      .send({ fromReleaseUuid: oldUuid })
      .expect(201)

    expect(response.body).toMatchObject({ triggeredBy: 'rollback', sourceReleaseUuid: oldUuid })
    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(app).toMatchObject({ image: 'nginx:1.27', env: { OLD: '1' } })
  })

  it('returns 404 for a release of another app, 400 for a non-uuid', async () => {
    const other = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('create-release-other')
      .build()
    const foreign = new ReleaseBuilder().withApp(other).build()
    await setup.db.insert(appTable).values(other)
    await setup.db.insert(releaseTable).values(foreign)

    await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/releases`)
      .set('Cookie', cookie)
      .send({ fromReleaseUuid: foreign.uuid })
      .expect(404)
    await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/releases`)
      .set('Cookie', cookie)
      .send({ fromReleaseUuid: 'nope' })
      .expect(400)
  })

  it('returns 401 without a session', async () => {
    await request(setup.httpServer).post(`/api/v1/apps/${SLUG}/releases`).send({}).expect(401)
  })
})
