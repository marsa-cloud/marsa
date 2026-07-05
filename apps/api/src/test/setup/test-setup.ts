import { EntityManager, MikroORM } from '@mikro-orm/core'
import { ConfigService } from '@nestjs/config'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { TestingModule } from '@nestjs/testing'
import { Server } from 'http'
import request from 'supertest'

import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { TestApp } from '#src/test/setup/test-bench.js'

export class TestSetup {
  static async create(app: TestApp): Promise<TestSetup> {
    const em = app.orm.em.fork()
    const setup = new TestSetup(app.app, app.testModule, app.orm, em)
    await setup.initialize()
    return setup
  }

  private constructor(
    public readonly app: NestFastifyApplication,
    public readonly testModule: TestingModule,
    public readonly orm: MikroORM,
    public readonly entityManager: EntityManager,
  ) {}

  private async initialize(): Promise<void> {
    await this.entityManager.begin()
  }

  public async teardown(): Promise<void> {
    // Discard this EM's (empty) transaction, then TRUNCATE every entity table.
    // The request path forks its own EMs and commits on separate connections
    // (request isolation), so those rows never ride the rollback — wiping here
    // is what actually isolates suites. Rollback alone can't, because a fork
    // neither joins the parent's transaction nor shares its connection.
    await this.entityManager.rollback()
    await this.orm.schema.clearDatabase()
  }

  public get httpServer(): Server {
    return this.app.getHttpServer()
  }

  /**
   * Run the GitHub-login dance and return a valid session cookie for
   * `SessionAuthGuard`-protected e2e requests. Seeds a GitHubApp, begins the
   * OAuth flow to capture the state, then completes login. Reused across
   * deployment e2e suites so the boilerplate lives in one place.
   */
  public async authenticate(): Promise<string> {
    const cipher = new SecretCipherService(new ConfigService())
    const githubApp = new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
    await this.orm.em.fork().persistAndFlush(githubApp)

    const beginResponse = await request(this.httpServer).get('/api/v1/auth/github').expect(302)
    const beginCookie = beginResponse.headers['set-cookie']?.[0]
    if (!beginCookie) {
      throw new Error('Expected a Set-Cookie header from GET /api/v1/auth/github')
    }
    const state = new URL(beginResponse.headers.location).searchParams.get(
      'state',
    ) as OAuthStateUuid

    const loginResponse = await request(this.httpServer)
      .post('/api/v1/auth/github/session')
      .set('Cookie', beginCookie)
      .send(new CompleteGithubLoginCommandBuilder().withState(state).build())
      .expect(200)

    const sessionCookie = loginResponse.headers['set-cookie']?.[0]
    if (!sessionCookie) {
      throw new Error('Expected a Set-Cookie header from POST /api/v1/auth/github/session')
    }
    return sessionCookie
  }
}
