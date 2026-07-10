import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG_A = 'list-apps-e2e-a'
const SLUG_B = 'list-apps-e2e-b'

describe('GET /api/v1/deployments/apps (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()

    // Seed straight through the EM — the only HTTP call under test is the GET
    // below, so the fixtures are built with the entity builder, not by driving
    // the deploy endpoint.
    const em = setup.orm.em.fork()
    const appA = new AppBuilder().withSlug(SLUG_A).withImage('nginx:1.27').build()
    const appB = new AppBuilder().withSlug(SLUG_B).withImage('nginx:1.27').build()
    await em.persistAndFlush([appA, appB])
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists deployed apps with slug, image and public URL', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/deployments/apps')
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(Array.isArray(response.body.apps)).toBe(true)

    const slugs = response.body.apps.map((app: { slug: string }) => app.slug)
    expect(slugs).toContain(SLUG_A)
    expect(slugs).toContain(SLUG_B)

    const appA = response.body.apps.find((app: { slug: string }) => app.slug === SLUG_A)
    expect(appA.image).toBe('nginx:1.27')
    expect(appA.url).toBe(`https://${SLUG_A}.demo.marsa.cc`)
    expect(typeof appA.createdAt).toBe('string')
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/deployments/apps').expect(401)
  })
})
