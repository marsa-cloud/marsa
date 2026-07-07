import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'
import request from 'supertest'

import { DeployAppCommandBuilder } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.builder.js'
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

    for (const slug of [SLUG_A, SLUG_B]) {
      await request(setup.httpServer)
        .post('/api/v1/deployments/deploy')
        .set('Cookie', sessionCookie)
        .send(new DeployAppCommandBuilder().withSlug(slug).withImage('nginx:1.27').build())
        .expect(200)
    }
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists deployed apps with slug, image, public URL and current status', async () => {
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
    expect(typeof appA.deployStatus).toBe('string')
    expect(typeof appA.createdAt).toBe('string')
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/deployments/apps').expect(401)
  })
})
