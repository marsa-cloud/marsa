import { after, before, describe, it } from 'node:test'
import { ConfigService } from '@nestjs/config'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { userTable } from '#src/app/user/entities/user.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('POST /api/v1/auth/github/session (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('completes the login, upserts the user, and sets the session cookie', async () => {
    const cipher = new SecretCipherService(new ConfigService())
    const app = new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
    await setup.db.insert(githubAppTable).values(app)

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
    await setup.db.insert(githubAppTable).values(app)

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
      const [firstUser] = await setup.db
        .select()
        .from(userTable)
        .where(eq(userTable.githubUserId, '1'))

      await login()
      const [secondUser] = await setup.db
        .select()
        .from(userTable)
        .where(eq(userTable.githubUserId, '1'))

      expect(firstUser?.uuid).toBeDefined()
      expect(secondUser?.uuid).toBe(firstUser?.uuid)
    } finally {
      await setup.db
        .delete(githubAppTable)
        .where(eq(githubAppTable.githubAppId, 'repeat-login-test'))
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
    await setup.db.insert(githubAppTable).values(app)

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
      await setup.db
        .delete(githubAppTable)
        .where(eq(githubAppTable.githubAppId, 'mismatch-state-test'))
    }
  })
})
