import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'update-app-e2e'

describe('PATCH /api/v1/apps/:slug (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
    await setup.db
      .insert(appTable)
      .values(
        new AppBuilder()
          .withEnvironmentUuid(environment.uuid)
          .withSlug(SLUG)
          .withMinReplicas(0)
          .withMaxReplicas(2)
          .withEnv({ A: '1' })
          .withImagePullCredentialsEnc('x')
          .build(),
      )
  })

  after(async () => {
    await setup.teardown()
  })

  it('patches only the sent fields and never returns credentials', async () => {
    const response = await request(setup.httpServer)
      .patch(`/api/v1/apps/${SLUG}`)
      .set('Cookie', cookie)
      .send({ image: 'nginx:1.28', env: { B: '2' } })
      .expect(200)

    expect(response.body).toEqual({
      slug: SLUG,
      image: 'nginx:1.28',
      containerPort: 80,
      minReplicas: 0,
      maxReplicas: 2,
      env: { B: '2' },
      nodePin: null,
    })
    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(app.imagePullCredentialsEnc).toBe('x')
  })

  it('lifts the stored ceiling when a new floor exceeds it', async () => {
    const response = await request(setup.httpServer)
      .patch(`/api/v1/apps/${SLUG}`)
      .set('Cookie', cookie)
      .send({ minReplicas: 5 })
      .expect(200)

    expect(response.body).toMatchObject({ minReplicas: 5, maxReplicas: 5 })
  })

  it('clears credentials when sent null', async () => {
    await request(setup.httpServer)
      .patch(`/api/v1/apps/${SLUG}`)
      .set('Cookie', cookie)
      .send({ imagePullCredentials: null })
      .expect(200)

    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(app.imagePullCredentialsEnc).toBeNull()
  })

  it('rejects a ceiling below the floor with 400', async () => {
    await request(setup.httpServer)
      .patch(`/api/v1/apps/${SLUG}`)
      .set('Cookie', cookie)
      .send({ minReplicas: 3, maxReplicas: 2 })
      .expect(400)
  })

  it('returns 404 for an unknown app and 401 without a session', async () => {
    await request(setup.httpServer)
      .patch('/api/v1/apps/ghost')
      .set('Cookie', cookie)
      .send({})
      .expect(404)
    await request(setup.httpServer).patch(`/api/v1/apps/${SLUG}`).send({}).expect(401)
  })

  it('sets and then clears the node pin', async () => {
    const set = await request(setup.httpServer)
      .patch(`/api/v1/apps/${SLUG}`)
      .set('Cookie', cookie)
      .send({
        nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
      })
      .expect(200)

    expect(set.body.nodePin).toEqual({
      key: 'kubernetes.io/hostname',
      values: ['node-a'],
      strategy: 'required',
    })

    const cleared = await request(setup.httpServer)
      .patch(`/api/v1/apps/${SLUG}`)
      .set('Cookie', cookie)
      .send({ nodePin: null })
      .expect(200)

    expect(cleared.body.nodePin).toBeNull()
  })
})
