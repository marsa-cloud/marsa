import { before, describe, it } from 'node:test'

import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { BeginGithubLoginRepository } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.repository.js'
import { BeginGithubLoginUseCase } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.use-case.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { githubAppConfig } from '#src/app/github-app/github-app.config.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const ISSUED_STATE = '11111111-1111-1111-1111-111111111111'

function build(options: { app?: GitHubApp | null } = {}) {
  const app = options.app === undefined ? new GitHubAppBuilder().build() : options.app

  const repository = createStubInstance(BeginGithubLoginRepository)
  repository.loadProvisionedApp.resolves(app)

  const oauthState = createStubInstance(OAuthStateService)
  oauthState.issue.resolves(ISSUED_STATE)

  const usecase = new BeginGithubLoginUseCase(repository, oauthState, githubAppConfig())
  return { usecase, repository, oauthState, app }
}

describe('BeginGithubLoginUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the GitHub authorize URL from the provisioned App and a freshly issued state', async () => {
    const { usecase, app } = build()

    const url = await usecase.execute()

    expect(url).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('client_id')).toBe(app!.clientId)
    expect(parsed.searchParams.get('state')).toBe(ISSUED_STATE)
    expect(parsed.searchParams.get('redirect_uri')).toBe(githubAppConfig().oauthCallbackUrl)
  })

  it('rejects when no App has been provisioned, without issuing a state', async () => {
    const { usecase, oauthState } = build({ app: null })

    await expect(usecase.execute()).rejects.toThrow(/No provisioned GitHub App/)
    expect(oauthState.issue.notCalled).toBe(true)
  })
})
