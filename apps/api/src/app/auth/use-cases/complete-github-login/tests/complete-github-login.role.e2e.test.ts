import { after, before, beforeEach, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import request from 'supertest'

import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('first-user-admin role assignment (e2e)', () => {
  let setup: TestSetup
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    em = setup.testModule.get(EntityManager)
  })

  after(async () => {
    await em.fork().nativeDelete(GitHubApp, {})
    await em.fork().nativeDelete(User, {})
    await em.fork().nativeDelete(OAuthState, {})
    await setup.teardown()
  })

  // Each case controls the user count, so start from a clean slate every time —
  // the request path commits on its own forked EMs, outside the TestSetup tx.
  beforeEach(async () => {
    await em.fork().nativeDelete(GitHubApp, {})
    await em.fork().nativeDelete(User, {})
    await em.fork().nativeDelete(OAuthState, {})
  })

  async function provisionApp(): Promise<void> {
    const app = new GitHubAppBuilder()
      .withClientSecretEnc(new SecretCipherService(new ConfigService()).encrypt('shh'))
      .build()
    await em.fork().persistAndFlush(app)
  }

  // The mock GitHub client always resolves the same identity (id 1), so a login
  // always upserts user "1"; we vary only the pre-existing user count. Drives the
  // real begin→complete flow so the state/session CSRF binding is exercised.
  async function login(): Promise<void> {
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

  it('assigns Operator to the first user when the users table is empty', async () => {
    await provisionApp()
    await login()

    const user = await em.fork().findOneOrFail(User, { githubUserId: '1' })
    expect(user.role).toBe(UserRole.Operator)
  })

  it('assigns Member when a user already exists', async () => {
    // A prior user means this login is not the bootstrap operator.
    await em
      .fork()
      .persistAndFlush(
        new UserBuilder().withGithubUserId('999').withRole(UserRole.Operator).build(),
      )
    await provisionApp()
    await login()

    const user = await em.fork().findOneOrFail(User, { githubUserId: '1' })
    expect(user.role).toBe(UserRole.Member)
  })

  it('does not change a returning user’s role on re-login', async () => {
    // First login bootstraps Operator; the second login would compute Member
    // (count is now 1) but must not demote the existing row.
    await provisionApp()
    await login()
    await login()

    const user = await em.fork().findOneOrFail(User, { githubUserId: '1' })
    expect(user.role).toBe(UserRole.Operator)
  })
})
