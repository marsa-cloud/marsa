import { ConfigService } from '@nestjs/config'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { TestingModule } from '@nestjs/testing'
import { Server } from 'http'
import request from 'supertest'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { DATABASE } from '#src/modules/database/database.tokens.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import type { TestApp } from '#src/test/setup/test-bench.js'
import { truncateAll } from '#src/test/setup/truncate.js'

export class TestSetup {
  static create(app: TestApp): TestSetup {
    return new TestSetup(app.app, app.testModule)
  }

  private constructor(
    public readonly app: NestFastifyApplication,
    public readonly testModule: TestingModule,
  ) {}

  public async teardown(): Promise<void> {
    // TRUNCATE every table to isolate suites. The request path commits on its own
    // pooled connections, so there's no transaction to roll back — wiping is what
    // isolates. See truncate.ts.
    await truncateAll(this.db)
  }

  public get httpServer(): Server {
    return this.app.getHttpServer()
  }

  public get db(): Database {
    return this.testModule.get<Database>(DATABASE)
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
    await this.db.insert(githubAppTable).values(githubApp)

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
