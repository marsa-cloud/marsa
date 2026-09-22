import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

const SLUG = 'create-app-e2e'

describe('POST /api/v1/apps (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
  })

  after(async () => {
    await setup.teardown()
  })

  it('stores a node pin', async () => {
    const slug = 'create-app-pinned'
    await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug,
        image: 'nginx:1.27',
        containerPort: 80,
        nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
      })
      .expect(201)

    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, slug))
    expect(app.nodePin).toEqual({
      key: 'kubernetes.io/hostname',
      values: ['node-a'],
      strategy: 'required',
    })
  })

  it('rejects a malformed node pin', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug: 'create-app-bad-pin',
        image: 'nginx:1.27',
        containerPort: 80,
        nodePin: { key: 'not a key', values: [], strategy: 'required' },
      })
      .expect(400)
  })

  it('creates the app with no release and returns its URL', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug: SLUG,
        image: 'nginx:1.27',
        containerPort: 80,
      })
      .expect(201)

    expect(response.body).toEqual({ slug: SLUG, url: `https://${SLUG}.demo.marsa.cc` })
    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(app.image).toBe('nginx:1.27')
    expect(app.environmentUuid).toBe(environment.uuid)
    const releases = await setup.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, app.uuid))
    expect(releases).toHaveLength(0)
  })

  it('rejects a duplicate slug with 409', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug: SLUG,
        image: 'nginx:1.28',
        containerPort: 80,
      })
      .expect(409)
  })

  it('rejects an invalid slug with 400', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug: 'Not_A_Label',
        image: 'nginx:1.27',
        containerPort: 80,
      })
      .expect(400)
  })

  it('rejects an unknown environment with 404', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({
        environmentUuid: generateUuid<EnvironmentUuid>(),
        slug: 'create-app-e2e-orphan',
        image: 'nginx:1.27',
        containerPort: 80,
      })
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).post('/api/v1/apps').send({}).expect(401)
  })
})
