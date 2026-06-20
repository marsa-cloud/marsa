import { after, before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import request from 'supertest'

import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/auth/me (e2e)', () => {
  let setup: TestSetup
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    em = setup.testModule.get(EntityManager)
  })

  after(async () => {
    // The use-case + state service each fork their own EM and commit, so these
    // rows don't ride the TestSetup transaction — wipe them explicitly.
    await em.fork().nativeDelete(GitHubApp, {})
    await em.fork().nativeDelete(User, {})
    await em.fork().nativeDelete(OAuthState, {})
    await setup.teardown()
  })

  it('returns the current user for a valid session cookie', async () => {
    const cipher = new SecretCipherService(new ConfigService())
    const app = new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
    await em.fork().persistAndFlush(app)

    const beginResponse = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
    const beginCookie = beginResponse.headers['set-cookie']?.[0]
    expect(beginCookie).toBeDefined()
    const state = new URL(beginResponse.headers.location).searchParams.get('state')
    expect(state).toBeTruthy()

    const loginResponse = await request(setup.httpServer)
      .post('/api/v1/auth/github/session')
      .set('Cookie', beginCookie)
      .send(new CompleteGithubLoginCommandBuilder().withState(state!).build())
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
