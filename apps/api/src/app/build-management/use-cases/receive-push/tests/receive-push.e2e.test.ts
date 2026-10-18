import { after, before, describe, it } from 'node:test'
import { sign } from '@octokit/webhooks-methods'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { AppSourceBuilder } from '#src/app/app-management/entities/app-source.builder.js'
import { buildTable } from '#src/app/build-management/entities/build.table.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TEST_WEBHOOK_SECRET } from '#src/test/setup/test-constants.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const ROUTE = '/api/v1/github-app/webhooks'

const pushBody = JSON.stringify({
  ref: 'refs/heads/main',
  after: MOCK_COMMIT_SHA,
  deleted: false,
  repository: { full_name: 'acme/shop' },
  installation: { id: 5151 },
})

describe('POST /api/v1/github-app/webhooks (e2e)', () => {
  let setup: TestSetup
  let app: App

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    const { environment } = await setup.seedEnvironment()
    const installation = await setup.seedGithubInstallation('5151')
    app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('webhook-e2e-app')
      .withSource(new AppSourceBuilder().withInstallationUuid(installation.uuid).build())
      .build()
    await setup.db.insert(appTable).values(app)
  })

  after(async () => {
    await setup.teardown()
  })

  const deliver = async (body: string, signature?: string) =>
    request(setup.httpServer)
      .post(ROUTE)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signature ?? (await sign(TEST_WEBHOOK_SECRET, body)))
      .send(body)

  it('starts a push build of the pushed commit', async () => {
    const response = await deliver(pushBody)

    expect(response.status).toBe(202)
    expect(response.body.builds).toEqual([
      { appSlug: 'webhook-e2e-app', buildUuid: expect.any(String) },
    ])
    const [build] = await setup.db
      .select()
      .from(buildTable)
      .where(eq(buildTable.uuid, response.body.builds[0].buildUuid))
    expect(build).toMatchObject({ commitSha: MOCK_COMMIT_SHA, trigger: 'push', status: 'running' })
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    expect(runtime.started.get(build.uuid)?.commitSha).toBe(MOCK_COMMIT_SHA)
  })

  it('does not build the same commit twice when GitHub redelivers', async () => {
    const response = await deliver(pushBody)

    expect(response.status).toBe(202)
    expect(response.body.builds).toEqual([])
    const builds = await setup.db.select().from(buildTable).where(eq(buildTable.appUuid, app.uuid))
    expect(builds).toHaveLength(1)
  })

  it('401s a delivery signed with the wrong secret', async () => {
    const response = await deliver(pushBody, await sign('wrong', pushBody))

    expect(response.status).toBe(401)
  })
})
