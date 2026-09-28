import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { buildTable } from '#src/app/build-management/entities/build.table.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'build-index-e2e-app'

describe('GET /api/v1/apps/:slug/builds (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    const { environment } = await setup.seedEnvironment()
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(SLUG).build()
    await setup.db.insert(appTable).values(app)
    // uuidv7 orders by creation, so insertion order is the expected newest-last order.
    await setup.db.insert(buildTable).values(new BuildBuilder().withApp(app).build())
    await setup.db
      .insert(buildTable)
      .values(
        new BuildBuilder()
          .withApp(app)
          .withStatus(BuildStatus.Failed)
          .withFailureReason('no Dockerfile')
          .build(),
      )
    await setup.db
      .insert(buildTable)
      .values(
        new BuildBuilder()
          .withApp(app)
          .withStatus(BuildStatus.Succeeded)
          .withImageRef('registry.mock.test/x:1')
          .build(),
      )
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists the builds newest first', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/builds`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.items.map((item: { status: string }) => item.status)).toEqual([
      'succeeded',
      'failed',
      'running',
    ])
    expect(response.body.items[0].imageRef).toBe('registry.mock.test/x:1')
    expect(response.body.items[1].failureReason).toBe('no Dockerfile')
  })

  it('returns one page plus a cursor when a limit is given', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${SLUG}/builds`)
      .query({ pagination: { limit: 2 } })
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.items).toHaveLength(2)
    expect(response.body.meta.next.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/apps/${SLUG}/builds`).expect(401)
  })
})
