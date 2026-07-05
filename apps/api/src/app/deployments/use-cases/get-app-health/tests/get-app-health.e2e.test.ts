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

const SLUG = 'health-e2e-app'

describe('GET /api/v1/deployments/apps/:slug/health (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    const em = setup.testModule.get(EntityManager)

    const cipher = new SecretCipherService(new ConfigService())
    const githubApp = new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
    await em.fork().persistAndFlush(githubApp)

    const beginResponse = await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
    const beginCookie = beginResponse.headers['set-cookie']?.[0]
    const state = new URL(beginResponse.headers.location).searchParams.get(
      'state',
    ) as OAuthStateUuid

    const loginResponse = await request(setup.httpServer)
      .post('/api/v1/auth/github/session')
      .set('Cookie', beginCookie)
      .send(new CompleteGithubLoginCommandBuilder().withState(state).build())
      .expect(200)
    sessionCookie = loginResponse.headers['set-cookie']?.[0]
  })

  after(async () => {
    await setup.teardown()
  })

  it('returns the live health verdict (mock backend reports healthy)', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/deployments/apps/${SLUG}/health`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.status).toBe('healthy')
    expect(response.body.availableReplicas).toBe(1)
    expect(response.body.desiredReplicas).toBe(1)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/deployments/apps/${SLUG}/health`).expect(401)
  })
})
