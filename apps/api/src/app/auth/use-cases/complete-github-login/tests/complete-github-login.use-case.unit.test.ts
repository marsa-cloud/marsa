import { before, describe, it } from 'node:test'

import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import { OperatorBuilder } from '#src/app/auth/entities/operator.builder.js'
import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import { CompleteGithubLoginUseCase } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.use-case.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { OctokitGithubClient } from '#src/modules/github-client/octokit-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const command = () => new CompleteGithubLoginCommandBuilder().build()

function build(options: { app?: GitHubApp | null; stateValid?: boolean } = {}) {
  const cipher = new SecretCipherService()
  const app =
    options.app === undefined
      ? new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
      : options.app

  const repository = createStubInstance(CompleteGithubLoginRepository)
  repository.loadProvisionedApp.resolves(app)
  repository.upsertByGithubUserId.resolves(
    new OperatorBuilder().withGithubUserId('1').withGithubLogin('marsa-mock-user').build(),
  )

  const oauthState = createStubInstance(OAuthStateService)
  oauthState.consume.resolves(options.stateValid ?? true)

  const github = createStubInstance(OctokitGithubClient)
  github.exchangeUserOAuthCode.resolves('ghu_mock_user_access_token')
  github.getAuthenticatedUser.resolves({ id: 1, login: 'marsa-mock-user' })

  const usecase = new CompleteGithubLoginUseCase(repository, oauthState, github, cipher)
  return { usecase, repository, oauthState, github, app }
}

describe('CompleteGithubLoginUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('exchanges the code, upserts the operator by GitHub numeric id, and returns it', async () => {
    const { usecase, repository, github } = build()

    const operator = await usecase.execute(command())

    expect(operator.githubUserId).toBe('1')
    expect(operator.githubLogin).toBe('marsa-mock-user')
    expect(repository.upsertByGithubUserId.calledOnceWithExactly('1', 'marsa-mock-user')).toBe(
      true,
    )
    expect(github.exchangeUserOAuthCode.calledOnce).toBe(true)
  })

  it('rejects an invalid or expired state before calling GitHub', async () => {
    const { usecase, github } = build({ stateValid: false })

    await expect(usecase.execute(command())).rejects.toThrow(/Invalid or expired OAuth state/)
    expect(github.exchangeUserOAuthCode.notCalled).toBe(true)
  })

  it('rejects when no App has been provisioned', async () => {
    const { usecase, github } = build({ app: null })

    await expect(usecase.execute(command())).rejects.toThrow(/No provisioned GitHub App/)
    expect(github.exchangeUserOAuthCode.notCalled).toBe(true)
  })

  it('maps a GitHub exchange/lookup failure to a 502 without leaking the upstream error', async () => {
    const { usecase, github, repository } = build()
    github.exchangeUserOAuthCode.rejects(new Error('bad code'))

    await expect(usecase.execute(command())).rejects.toThrow(
      /Could not complete login with GitHub/,
    )
    expect(repository.upsertByGithubUserId.notCalled).toBe(true)
  })

  it('lets a decrypt failure surface as itself, before any GitHub call', async () => {
    const app = new GitHubAppBuilder().withClientSecretEnc('not-a-valid-ciphertext').build()
    const { usecase, github } = build({ app })

    await expect(usecase.execute(command())).rejects.not.toThrow(
      /Could not complete login with GitHub/,
    )
    expect(github.exchangeUserOAuthCode.notCalled).toBe(true)
  })
})
