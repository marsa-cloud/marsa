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

  it('ignores a failed release when deciding whether saved config is running', async () => {
    const app = new AppBuilder().withSlug('detail-e2e-failed').withEnv({ A: 'new' }).build()
    const running = new ReleaseBuilder()
      .withApp({ ...app, env: { A: 'old' } })
      .withDeployStatus(DeployStatus.Succeeded)
      .build()
    const failed = new ReleaseBuilder().withApp(app).withDeployStatus(DeployStatus.Failed).build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(releaseTable).values([running, failed])

    const response = await request(setup.httpServer)
      .get('/api/v1/apps/detail-e2e-failed')
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.hasUndeployedChanges).toBe(true)
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
