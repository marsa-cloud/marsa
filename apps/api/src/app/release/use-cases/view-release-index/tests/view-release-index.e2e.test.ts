import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'releases-e2e-app'

describe('GET /api/v1/apps/:slug/releases (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let sessionCookie: string
  let releaseUuid: string
  const mockBackend = () => setup.testModule.get<DeployBackend, MockDeployBackend>(DeployBackend)

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment

    // Seed straight through Drizzle — the only endpoint under test is the GET
    // below. The release starts `pending` so the assertion below exercises the
    // refresh-on-read reconciliation (AgDR-0034).
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(SLUG)
      .withImage('nginx:1.27')
      .build()
    const release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(releaseTable).values(release)
    releaseUuid = release.uuid
  })

  after(async () => {
    await setup.teardown()
  })

  it('keeps a release that was never deployed pending', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/releases`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.items[0].deployStatus).toBe('pending')
  })

  it('lists releases and reconciles the live one to succeeded (mock rollout Complete)', async () => {
    mockBackend().setLiveRelease(SLUG, releaseUuid)

    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/releases`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.items[0].deployStatus).toBe('succeeded')
    expect(response.body.items[0].imageRef).toBe('nginx:1.27')
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/apps/${SLUG}/releases`).expect(401)
  })
})
