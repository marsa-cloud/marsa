import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'create-app-e2e'

describe('POST /api/v1/apps (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('creates the app with no release and returns its URL', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({ slug: SLUG, image: 'nginx:1.27', containerPort: 80 })
      .expect(201)

    expect(response.body).toEqual({ slug: SLUG, url: `https://${SLUG}.demo.marsa.cc` })
    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(app.image).toBe('nginx:1.27')
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
      .send({ slug: SLUG, image: 'nginx:1.28', containerPort: 80 })
      .expect(409)
  })

  it('rejects an invalid slug with 400', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', cookie)
      .send({ slug: 'Not_A_Label', image: 'nginx:1.27', containerPort: 80 })
      .expect(400)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).post('/api/v1/apps').send({}).expect(401)
  })
})
