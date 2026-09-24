import { after, before, describe, it } from 'node:test'
import { sign } from '@octokit/webhooks-methods'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const ROUTE = '/api/v1/github-app/webhooks'
const SECRET = 'whsec-e2e'
const SHA = 'd'.repeat(40)

const pushBody = JSON.stringify({
  ref: 'refs/heads/main',
  after: SHA,
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
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('5151').build(),
      slug: 'marsa-webhook-e2e',
      webhookSecretEnc: cipher.encrypt(SECRET),
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('5151')
      .withAppUuid(githubApp.uuid)
      .build()
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
    app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('webhook-e2e-app')
      .withSource({
        type: 'github',
        installationUuid: installation.uuid,
        repo: 'acme/shop',
        branch: 'main',
        rootDir: '.',
        dockerfilePath: 'Dockerfile',
      })
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
      .set('X-Hub-Signature-256', signature ?? (await sign(SECRET, body)))
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
    expect(build).toMatchObject({ commitSha: SHA, trigger: 'push', status: 'running' })
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    expect(runtime.started.get(build.uuid)?.commitSha).toBe(SHA)
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
