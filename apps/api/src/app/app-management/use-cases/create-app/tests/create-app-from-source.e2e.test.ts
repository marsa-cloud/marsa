import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { restore, stub } from 'sinon'
import request from 'supertest'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/apps from a GitHub repo (e2e)', () => {
  let setup: TestSetup
  let cookie: string
  let environment: Environment
  let installationUuid: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('7171').build(),
      slug: 'marsa-create-e2e',
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('7171')
      .withAppUuid(githubApp.uuid)
      .build()
    installationUuid = installation.uuid
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
  })

  after(async () => {
    restore()
    await setup.teardown()
  })

  const create = (body: object) =>
    request(setup.httpServer).post('/api/v1/apps').set('Cookie', cookie).send(body)

  it('creates the app without an image and starts its first build', async () => {
    const response = await create({
      environmentUuid: environment.uuid,
      slug: 'from-source-e2e',
      source: { installationUuid, repo: 'acme/shop', branch: 'main' },
    }).expect(201)

    expect(response.body.slug).toBe('from-source-e2e')
    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, 'from-source-e2e'))
    expect(app).toMatchObject({ image: null, containerPort: 8080 })
    const [build] = await setup.db.select().from(buildTable).where(eq(buildTable.appUuid, app.uuid))
    expect(build).toMatchObject({
      commitSha: MOCK_COMMIT_SHA,
      trigger: 'create',
      status: 'running',
    })
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    expect(runtime.started.has(build.uuid)).toBe(true)
  })

  it('422s, creating nothing, when the branch is not readable', async () => {
    const github = setup.testModule.get(GithubClient)
    stub(github, 'getBranchHead').rejects(
      new Error("Branch 'nope' of 'acme/shop' was not found, or the GitHub App cannot access it."),
    )

    const response = await create({
      environmentUuid: environment.uuid,
      slug: 'from-source-e2e-missing',
      source: { installationUuid, repo: 'acme/shop', branch: 'nope' },
    }).expect(422)

    expect(response.body.message).toContain("Branch 'nope'")
    const apps = await setup.db
      .select()
      .from(appTable)
      .where(eq(appTable.slug, 'from-source-e2e-missing'))
    expect(apps).toHaveLength(0)
    restore()
  })

  it('400s a body with both an image and a source', async () => {
    await create({
      environmentUuid: environment.uuid,
      slug: 'from-source-e2e-both',
      image: 'nginx:1.27',
      containerPort: 80,
      source: { installationUuid, repo: 'acme/shop', branch: 'main' },
    }).expect(400)
  })
})
