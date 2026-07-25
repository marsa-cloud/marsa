import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/auth/github (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('redirects to the GitHub OAuth consent screen when an App is provisioned', async () => {
    const app = new GitHubAppBuilder().build()
    await setup.db.insert(githubAppTable).values(app)

    try {
      const response = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)

      const location = response.headers.location
      expect(location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/)
      expect(new URL(location).searchParams.get('client_id')).toBe(app.clientId)
      // redirect_uri must point at the web app's callback route (where the SPA
      // reads code+state and POSTs them to complete-login) — NOT the api host,
      // and it must match the URL registered in the GitHub App manifest.
      expect(new URL(location).searchParams.get('redirect_uri')).toBe(
        'https://demo.marsa.cc/auth/github/callback',
      )
      // The state is bound into the session cookie so complete-login can verify
      // the callback came from the same browser that began the flow (#62).
      expect(response.headers['set-cookie']?.[0]).toMatch(/marsa_session=/)
    } finally {
      // Forked EM commits outside the TestSetup transaction (request isolation),
      // so this row would otherwise leak into the sibling "no App provisioned" test.
      await setup.db.delete(githubAppTable)
    }
  })

  it('redirects to the setup wizard when no GitHub App has been provisioned', async () => {
    // First-run bootstrap: erroring here would dead-end the operator, who can't
    // have logged in before the App exists. Send them to provisioning instead.
    const response = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)

    expect(response.headers.location).toMatch(/\/setup\/github$/)
    // No OAuth state is issued on the bootstrap path, so no session is bound.
    expect(response.headers['set-cookie']).toBeUndefined()
  })
})
