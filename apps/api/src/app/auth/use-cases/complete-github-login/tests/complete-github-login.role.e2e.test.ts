import { after, before, describe, it } from 'node:test'
import { EntityManager } from '@mikro-orm/core'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { Server } from 'http'
import request from 'supertest'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

async function provisionApp(em: EntityManager): Promise<void> {
  const app = new GitHubAppBuilder()
    .withClientSecretEnc(new SecretCipherService(new ConfigService()).encrypt('shh'))
    .build()
  await em.fork().persistAndFlush(app)
}

// The mock GitHub client always resolves the same identity (id 1), so every
// login upserts user "1"; cases vary only the pre-existing user count.
async function login(httpServer: Server): Promise<void> {
  const beginResponse = await request(httpServer).get('/api/v1/auth/github').expect(302)
  const beginCookie = beginResponse.headers['set-cookie']?.[0]
  const state = new URL(beginResponse.headers.location).searchParams.get('state') as OAuthStateUuid

  await request(httpServer)
    .post('/api/v1/auth/github/session')
    .set('Cookie', beginCookie)
    .send(new CompleteGithubLoginCommandBuilder().withState(state).build())
    .expect(200)
}

describe('first login bootstraps the Operator (e2e)', () => {
  let setup: TestSetup
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    em = setup.testModule.get(EntityManager)
    await provisionApp(em)
  })

  after(() => setup.teardown())

  it('assigns Operator to the first user', async () => {
    await login(setup.httpServer)

    const user = await em.fork().findOneOrFail(User, { githubUserId: '1' })
    expect(user.role).toBe(UserRole.Operator)
  })

  it('does not demote the user on re-login', async () => {
    await login(setup.httpServer)

    const user = await em.fork().findOneOrFail(User, { githubUserId: '1' })
    expect(user.role).toBe(UserRole.Operator)
  })
})

describe('a later user becomes a Member (e2e)', () => {
  let setup: TestSetup
  let em: EntityManager

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    em = setup.testModule.get(EntityManager)
    await provisionApp(em)
    await em.fork().persistAndFlush(new UserBuilder().withGithubUserId('999').build())
  })

  after(() => setup.teardown())

  it('assigns Member when a user already exists', async () => {
    await login(setup.httpServer)

    const user = await em.fork().findOneOrFail(User, { githubUserId: '1' })
    expect(user.role).toBe(UserRole.Member)
  })
})
