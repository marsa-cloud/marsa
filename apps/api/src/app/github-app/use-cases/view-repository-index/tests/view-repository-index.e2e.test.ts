import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MOCK_REPOSITORIES } from '#src/modules/github-client/mock-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/github-app/repositories (e2e)', () => {
  let setup: TestSetup
  let cookie: string
  let installationUuid: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('6161').build(),
      slug: 'marsa-repos-e2e',
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('6161')
      .withAppUuid(githubApp.uuid)
      .build()
    installationUuid = installation.uuid
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
  })

  after(async () => {
    await setup.teardown()
  })

  it("lists the installation's repositories", async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/github-app/repositories')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toEqual(
      MOCK_REPOSITORIES.map((repo) => ({ ...repo, installationUuid })),
    )
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/github-app/repositories').expect(401)
  })
})
