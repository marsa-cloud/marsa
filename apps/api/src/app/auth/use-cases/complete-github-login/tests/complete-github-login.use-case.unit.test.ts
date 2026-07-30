import { before, describe, it } from 'node:test'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommandBuilder } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.builder.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import { CompleteGithubLoginUseCase } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.use-case.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import type { GitHubApp } from '#src/app/github-app/entities/github-app.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { OctokitGithubClient } from '#src/modules/github-client/octokit-github-client.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const SESSION_STATE = generateUuid<OAuthStateUuid>()

const command = () => new CompleteGithubLoginCommandBuilder().withState(SESSION_STATE).build()

function build(options: { app?: GitHubApp | null; stateConsumed?: boolean } = {}) {
  const cipher = new SecretCipherService(new ConfigService())
  const app =
    options.app === undefined
      ? new GitHubAppBuilder().withClientSecretEnc(cipher.encrypt('shh')).build()
      : options.app

  const repository = createStubInstance(CompleteGithubLoginRepository)
  repository.loadProvisionedApp.resolves(app)
  repository.consumeState.resolves(options.stateConsumed ?? true)
  repository.lockUserBootstrap.resolves()
  repository.countUsers.resolves(1)
  repository.upsertUser.callsFake((_tx, user) => Promise.resolve(user))

  const github = createStubInstance(OctokitGithubClient)
  github.loginUser.resolves({ id: 1, login: 'marsa-mock-user' })

  const usecase = new CompleteGithubLoginUseCase(stubDatabase(), repository, github, cipher)
  return { usecase, repository, github, app }
}

describe('CompleteGithubLoginUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('exchanges the code, upserts the user by GitHub numeric id, and returns it', async () => {
    const { usecase, repository, github } = build()

    const user = await usecase.execute(command(), SESSION_STATE)

    expect(user.githubUserId).toBe('1')
    expect(user.githubLogin).toBe('marsa-mock-user')
    expect(github.loginUser.calledOnce).toBe(true)
    expect(repository.upsertUser.calledOnce).toBe(true)
  })

  it('takes the bootstrap lock before counting users', async () => {
    const { usecase, repository } = build()

    await usecase.execute(command(), SESSION_STATE)

    expect(
      repository.lockUserBootstrap.firstCall.calledBefore(repository.countUsers.firstCall),
    ).toBe(true)
  })

  it('rejects an invalid or expired state after exchanging the code, without persisting', async () => {
    const { usecase, github } = build({ stateConsumed: false })

    await expect(usecase.execute(command(), SESSION_STATE)).rejects.toThrow(
      /Invalid or expired OAuth state/,
    )
    // The state's single-use/replay guard runs inside the tx, so the code
    // exchange has already happened; the tx returns null and nothing persists.
    expect(github.loginUser.calledOnce).toBe(true)
  })

  it('rejects when the callback state does not match the session-bound state', async () => {
    const { usecase, github, repository } = build()

    await expect(usecase.execute(command(), 'some-other-state')).rejects.toThrow(
      /Invalid or expired OAuth state/,
    )
    expect(repository.consumeState.notCalled).toBe(true)
    expect(github.loginUser.notCalled).toBe(true)
  })

  it('rejects when no session-bound state is present at all', async () => {
    const { usecase, github } = build()

    await expect(usecase.execute(command(), undefined)).rejects.toThrow(
      /Invalid or expired OAuth state/,
    )
    expect(github.loginUser.notCalled).toBe(true)
  })

  it('rejects when no App has been provisioned', async () => {
    const { usecase, github } = build({ app: null })

    await expect(usecase.execute(command(), SESSION_STATE)).rejects.toThrow(
      /No provisioned GitHub App/,
    )
    expect(github.loginUser.notCalled).toBe(true)
  })

  it('maps a GitHub exchange/lookup failure to a 502 without leaking the upstream error', async () => {
    const { usecase, github, repository } = build()
    github.loginUser.rejects(new Error('bad code'))

    await expect(usecase.execute(command(), SESSION_STATE)).rejects.toThrow(
      /Could not complete login with GitHub/,
    )
    expect(repository.consumeState.notCalled).toBe(true)
  })

  it('lets a decrypt failure surface as itself, before any GitHub call', async () => {
    const app = new GitHubAppBuilder().withClientSecretEnc('not-a-valid-ciphertext').build()
    const { usecase, github } = build({ app })

    await expect(usecase.execute(command(), SESSION_STATE)).rejects.not.toThrow(
      /Could not complete login with GitHub/,
    )
    expect(github.loginUser.notCalled).toBe(true)
  })
})
