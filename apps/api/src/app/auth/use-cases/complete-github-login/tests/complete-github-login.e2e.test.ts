import { after, before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import request from 'supertest'

import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('POST /api/v1/auth/github/session (e2e)', () => {
  let setup: TestSetup
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    em = setup.testModule.get(EntityManager)
  })

  after(async () => {
    // The use-case + state service each fork their own EM and commit, so these
    // rows don't ride the TestSetup transaction — wipe them explicitly. The
    // mismatched-state test below issues a state via the real begin-login flow
    // but never consumes it (the mismatch is rejected before `consume()` runs).
    await em.fork().nativeDelete(GitHubApp, {})
    await em.fork().nativeDelete(User, {})
    await em.fork().nativeDelete(OAuthState, {})
    await setup.teardown()
  })

  it('completes the login, upserts the user, and sets the session cookie', async () => {
    const cipher = new SecretCipherService(new ConfigService())
    const app = new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
    await em.fork().persistAndFlush(app)

    // Drive the real begin-login flow to get a state bound to a session cookie,
    // rather than issuing one directly — this exercises the login-CSRF binding.
    const beginResponse = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
    const beginCookie = beginResponse.headers['set-cookie']?.[0]
    expect(beginCookie).toBeDefined()
    const state = new URL(beginResponse.headers.location).searchParams.get(
      'state',
    ) as OAuthStateUuid
    expect(state).toBeTruthy()

    const response = await request(setup.httpServer)
      .post('/api/v1/auth/github/session')
      .set('Cookie', beginCookie)
      .send(new CompleteGithubLoginCommandBuilder().withState(state).build())
      .expect(200)

    expect(response.body).toMatchObject({ id: '1', login: 'marsa-mock-user' })
    expect(response.headers['set-cookie']?.[0]).toMatch(/marsa_session=/)
  })

  it('keeps the same user uuid across a repeat login by the same GitHub user', async () => {
    const app = new GitHubAppBuilder()
      .withGithubAppId('repeat-login-test')
      .withSlug('marsa-app-repeat-login-test')
      .withClientSecretEnc(new SecretCipherService(new ConfigService()).encrypt('shh'))
      .build()
    await em.fork().persistAndFlush(app)

    const login = async () => {
      const beginResponse = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
      const beginCookie = beginResponse.headers['set-cookie']?.[0]
      const state = new URL(beginResponse.headers.location).searchParams.get(
        'state',
      ) as OAuthStateUuid
      await request(setup.httpServer)
        .post('/api/v1/auth/github/session')
        .set('Cookie', beginCookie)
        .send(new CompleteGithubLoginCommandBuilder().withState(state).build())
        .expect(200)
    }

    try {
      await login()
      const firstUser = await em.fork().findOneOrFail(User, { githubUserId: '1' })

      await login()
      const secondUser = await em.fork().findOneOrFail(User, { githubUserId: '1' })

      expect(secondUser.uuid).toBe(firstUser.uuid)
    } finally {
      await em.fork().nativeDelete(GitHubApp, { githubAppId: 'repeat-login-test' })
    }
  })

  it('rejects a state with no matching session-bound state with 400', async () => {
    await request(setup.httpServer)
      .post('/api/v1/auth/github/session')
      .send(
        new CompleteGithubLoginCommandBuilder().withState(generateUuid<OAuthStateUuid>()).build(),
      )
      .expect(400)
  })

  it('rejects a session-bound state that does not match the callback state with 400', async () => {
    const app = new GitHubAppBuilder()
      .withGithubAppId('mismatch-state-test')
      .withSlug('marsa-app-mismatch-state-test')
      .build()
    await em.fork().persistAndFlush(app)

    try {
      const beginResponse = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
      const beginCookie = beginResponse.headers['set-cookie']?.[0]

      await request(setup.httpServer)
        .post('/api/v1/auth/github/session')
        .set('Cookie', beginCookie)
        .send(
          new CompleteGithubLoginCommandBuilder().withState(generateUuid<OAuthStateUuid>()).build(),
        )
        .expect(400)
    } finally {
      await em.fork().nativeDelete(GitHubApp, { githubAppId: 'mismatch-state-test' })
    }
  })
})
