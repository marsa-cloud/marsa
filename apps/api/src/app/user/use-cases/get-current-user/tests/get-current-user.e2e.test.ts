import { after, before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import request from 'supertest'

import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
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

  after(() => setup.teardown())

  it('returns the current user (with role) for a valid session cookie', async () => {
    const cipher = new SecretCipherService(new ConfigService())
    const app = new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
    await em.fork().persistAndFlush(app)

    const beginResponse = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
    const beginCookie = beginResponse.headers['set-cookie']?.[0]
    expect(beginCookie).toBeDefined()
    const state = new URL(beginResponse.headers.location).searchParams.get(
      'state',
    ) as OAuthStateUuid
    expect(state).toBeTruthy()

    const loginResponse = await request(setup.httpServer)
      .post('/api/v1/auth/github/session')
      .set('Cookie', beginCookie)
      .send(new CompleteGithubLoginCommandBuilder().withState(state).build())
      .expect(200)
    const cookie = loginResponse.headers['set-cookie']?.[0]

    const response = await request(setup.httpServer)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body).toMatchObject({ id: '1', login: 'marsa-mock-user', role: 'operator' })
  })

  it('rejects with 401 when no session cookie is present', async () => {
    await request(setup.httpServer).get('/api/v1/auth/me').expect(401)
  })
})
