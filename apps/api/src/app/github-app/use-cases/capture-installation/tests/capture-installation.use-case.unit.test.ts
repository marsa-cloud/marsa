import { before, describe, it } from 'node:test'

import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { CaptureInstallationCommandBuilder } from '#src/app/github-app/use-cases/capture-installation/capture-installation.command.builder.js'
import { CaptureInstallationRepository } from '#src/app/github-app/use-cases/capture-installation/capture-installation.repository.js'
import { CaptureInstallationUseCase } from '#src/app/github-app/use-cases/capture-installation/capture-installation.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { OctokitGithubClient } from '#src/modules/github-client/octokit-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const command = (installationId = '777') =>
  new CaptureInstallationCommandBuilder()
    .withInstallationId(installationId)
    .withSetupAction('install')
    .build()

function build(options: { app?: GitHubApp | null; accountLogin?: string | null } = {}) {
  const cipher = new SecretCipherService(new ConfigService())
  const app =
    options.app === undefined
      ? new GitHubAppBuilder().withPrivateKeyPemEnc(cipher.encrypt('PEMDATA')).build()
      : options.app

  const repository = createStubInstance(CaptureInstallationRepository)
  repository.loadProvisionedApp.resolves(app)
  repository.upsertByInstallationId.resolves(
    new GitHubInstallationBuilder()
      .withInstallationId('777')
      .withAccountLogin(options.accountLogin ?? null)
      .build(),
  )

  const github = createStubInstance(OctokitGithubClient)
  github.getInstallationToken.resolves('ghs_ok')

  const usecase = new CaptureInstallationUseCase(repository, github, cipher)
  return { usecase, repository, github, app }
}

describe('CaptureInstallationUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('verifies via token mint and persists the installation', async () => {
    const { usecase, repository, github, app } = build()

    const result = await usecase.execute(command('777'))

    expect(result).toEqual({ installationId: '777', accountLogin: null, connected: true })
    expect(repository.upsertByInstallationId.calledOnceWithExactly('777', app!.uuid)).toBe(true)
    // The decrypted PEM (not the ciphertext) is what reaches the GitHub client.
    expect(github.getInstallationToken.firstCall.args[0]).toMatchObject({
      installationId: '777',
      privateKeyPem: 'PEMDATA',
    })
  })

  it('surfaces a known accountLogin on the response when present', async () => {
    const { usecase } = build({ accountLogin: 'octo-org' })

    const result = await usecase.execute(command('777'))

    expect(result.accountLogin).toBe('octo-org')
  })

  it('rejects when no App has been provisioned', async () => {
    const { usecase } = build({ app: null })

    await expect(usecase.execute(command('777'))).rejects.toThrow(/No provisioned GitHub App/)
  })

  it('maps a token-mint failure to a 502 without leaking the upstream error', async () => {
    const { usecase, repository, github } = build()
    github.getInstallationToken.rejects(new Error('401 bad PEM'))

    await expect(usecase.execute(command('777'))).rejects.toThrow(
      /Could not verify the installation/,
    )
    expect(repository.upsertByInstallationId.notCalled).toBe(true)
  })

  it('lets a decrypt failure surface as itself, before any GitHub call', async () => {
    const app = new GitHubAppBuilder().withPrivateKeyPemEnc('not-a-valid-ciphertext').build()
    const { usecase, github } = build({ app })

    await expect(usecase.execute(command('777'))).rejects.not.toThrow(
      /Could not verify the installation/,
    )
    expect(github.getInstallationToken.notCalled).toBe(true)
  })
})
