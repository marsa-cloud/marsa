import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'detail-e2e-app'

describe('GET /api/v1/apps/:slug (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns the stored config including env', async () => {
    await setup.db
      .insert(appTable)
      .values(
        new AppBuilder()
          .withSlug(SLUG)
          .withImage('nginx:1.27')
          .withContainerPort(8080)
          .withMinReplicas(2)
          .withMaxReplicas(2)
          .withEnv({ LOG_LEVEL: 'debug' })
          .build(),
      )

    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body).toMatchObject({
      slug: SLUG,
      image: 'nginx:1.27',
      containerPort: 8080,
      minReplicas: 2,
      maxReplicas: 2,
      env: { LOG_LEVEL: 'debug' },
      hasUndeployedChanges: true,
    })
  })

  it('warns until the saved config is what the cluster is actually running', async () => {
    const slug = 'detail-e2e-live'
    const detail = async () =>
      (
        await request(setup.httpServer)
          .get(`/api/v1/apps/${slug}`)
          .set('Cookie', sessionCookie)
          .expect(200)
      ).body.hasUndeployedChanges
    const createRelease = async () =>
      (
        await request(setup.httpServer)
          .post(`/api/v1/apps/${slug}/releases`)
          .set('Cookie', sessionCookie)
          .send({})
          .expect(201)
      ).body.releaseUuid as string

    await request(setup.httpServer)
      .post('/api/v1/apps')
      .set('Cookie', sessionCookie)
      .send({ slug, image: 'nginx:1.27', containerPort: 80 })
      .expect(201)
    expect(await detail()).toBe(true)

    await request(setup.httpServer)
      .post(`/api/v1/releases/${await createRelease()}/deploy`)
      .set('Cookie', sessionCookie)
      .expect(200)
    expect(await detail()).toBe(false)

    await request(setup.httpServer)
      .patch(`/api/v1/apps/${slug}`)
      .set('Cookie', sessionCookie)
      .send({ env: { A: 'new' } })
      .expect(200)
    expect(await detail()).toBe(true)

    // A release that matches the saved config but never reached the cluster changes nothing.
    await createRelease()
    expect(await detail()).toBe(true)
  })

  it('returns 404 for a slug that does not exist', async () => {
    await request(setup.httpServer)
      .get('/api/v1/apps/no-such-app')
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/apps/${SLUG}`).expect(401)
  })
})
