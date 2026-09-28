import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { buildTable } from '#src/app/build-management/entities/build.table.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'build-e2e-app'

describe('POST /api/v1/apps/:slug/builds (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('4242').build(),
      slug: 'marsa-build-e2e',
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('4242')
      .withAppUuid(githubApp.uuid)
      .build()
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(SLUG)
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

  it('starts a build of the branch head', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/builds`)
      .set('Cookie', sessionCookie)
      .expect(201)

    expect(response.body).toMatchObject({
      commitSha: MOCK_COMMIT_SHA,
      status: 'running',
      trigger: 'manual',
    })
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    expect(runtime.started.get(response.body.uuid)?.repoUrl).toBe(
      'https://github.com/acme/shop.git',
    )
  })

  it('supersedes the running build on a second rebuild', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/builds`)
      .set('Cookie', sessionCookie)
      .expect(201)

    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    const builds = await setup.db.select().from(buildTable).where(eq(buildTable.appUuid, app.uuid))
    expect(builds.filter((b) => b.status === BuildStatus.Running)).toHaveLength(1)
    expect(builds.some((b) => b.status === BuildStatus.Cancelled)).toBe(true)
  })

  it('409s an app without a source', async () => {
    const plain = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('build-e2e-plain')
      .build()
    await setup.db.insert(appTable).values(plain)

    await request(setup.httpServer)
      .post('/api/v1/apps/build-e2e-plain/builds')
      .set('Cookie', sessionCookie)
      .expect(409)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).post(`/api/v1/apps/${SLUG}/builds`).expect(401)
  })
})
