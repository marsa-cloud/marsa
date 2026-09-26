import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { type Build, buildTable } from '#src/app/build-management/entities/build.table.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { BuildLogsExpiredError } from '#src/app/build-management/errors/build-logs-expired.error.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

const SLUG = 'build-logs-e2e-app'

describe('GET /api/v1/apps/:slug/builds/:buildUuid/logs (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string
  let started: Build
  let expired: Build
  const url = (uuid: string) => `/api/v1/apps/${SLUG}/builds/${uuid}/logs`

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    const { environment } = await setup.seedEnvironment()
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(SLUG).build()
    await setup.db.insert(appTable).values(app)
    started = new BuildBuilder().withApp(app).build()
    expired = new BuildBuilder().withApp(app).withStatus(BuildStatus.Failed).build()
    await setup.db.insert(buildTable).values([started, expired])
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    await runtime.start(
      { build: { uuid: started.uuid }, app: { slug: SLUG } },
      {
        repoUrl: 'https://github.com/acme/shop.git',
        commitSha: started.commitSha,
        rootDir: '.',
        dockerfilePath: 'Dockerfile',
        gitToken: 't',
        pushRef: 'r/x:1',
      },
    )
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns the build log', async () => {
    const response = await request(setup.httpServer)
      .get(url(started.uuid))
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.logs).toBe(`mock build log for ${started.uuid}`)
  })

  it('404s once the logs are gone', async () => {
    const response = await request(setup.httpServer)
      .get(url(expired.uuid))
      .set('Cookie', sessionCookie)
      .expect(404)

    expect(response.body.message).toBe(new BuildLogsExpiredError().message)
  })

  it('404s an unknown build', async () => {
    await request(setup.httpServer)
      .get(url(generateUuid()))
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('400s a buildUuid that is not a uuid', async () => {
    await request(setup.httpServer).get(url('not-a-uuid')).set('Cookie', sessionCookie).expect(400)
  })
})
