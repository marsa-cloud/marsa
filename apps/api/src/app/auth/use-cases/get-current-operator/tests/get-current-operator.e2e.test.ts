import { after, before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { expect } from 'expect'
import request from 'supertest'

import { Operator } from '#src/app/auth/entities/operator.entity.js'
import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/auth/me (e2e)', () => {
  let setup: TestSetup
  let em: EntityManager
  let oauthState: OAuthStateService

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    em = setup.testModule.get(EntityManager)
    oauthState = setup.testModule.get(OAuthStateService)
  })

  after(async () => {
    await em.fork().nativeDelete(GitHubApp, {})
    await em.fork().nativeDelete(Operator, {})
    await setup.teardown()
  })

  it('returns the current operator for a valid session cookie', async () => {
    const cipher = new SecretCipherService()
    const app = new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
    await em.fork().persistAndFlush(app)
    const state = await oauthState.issue()

    const loginResponse = await request(setup.httpServer)
      .post('/api/v1/auth/github/session')
      .send(new CompleteGithubLoginCommandBuilder().withState(state).build())
      .expect(200)
    const cookie = loginResponse.headers['set-cookie']?.[0]

    const response = await request(setup.httpServer)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body).toMatchObject({ id: '1', login: 'marsa-mock-user' })
  })

  it('rejects with 401 when no session cookie is present', async () => {
    await request(setup.httpServer).get('/api/v1/auth/me').expect(401)
  })
})
