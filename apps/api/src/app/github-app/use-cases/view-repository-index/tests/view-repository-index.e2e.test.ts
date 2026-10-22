import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
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
    const installation = await setup.seedGithubInstallation('6161')
    installationUuid = installation.uuid
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
