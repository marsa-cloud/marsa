import { after, before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { expect } from 'expect'
import request from 'supertest'

import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/auth/github (e2e)', () => {
  let setup: TestSetup
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    em = setup.testModule.get(EntityManager)
  })

  after(async () => {
    // The use-case's repository forks its own EM (request isolation), so the
    // provisioned App seeded below is committed on a separate connection and
    // doesn't ride the TestSetup transaction — wipe it explicitly.
    await em.fork().nativeDelete(GitHubApp, {})
    await setup.teardown()
  })

  it('redirects to the GitHub OAuth consent screen when an App is provisioned', async () => {
    const app = new GitHubAppBuilder().build()
    await em.fork().persistAndFlush(app)

    try {
      const response = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)

      const location = response.headers.location
      expect(location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/)
      expect(new URL(location).searchParams.get('client_id')).toBe(app.clientId)
    } finally {
      // Forked EM commits outside the TestSetup transaction (request isolation),
      // so this row would otherwise leak into the sibling "no App provisioned" test.
      await em.fork().nativeDelete(GitHubApp, {})
    }
  })

  it('rejects with 400 when no GitHub App has been provisioned', async () => {
    await request(setup.httpServer).get('/api/v1/auth/github').expect(400)
  })
})
