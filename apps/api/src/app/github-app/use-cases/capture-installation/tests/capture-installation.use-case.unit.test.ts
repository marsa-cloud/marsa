import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'
import { CaptureInstallationCommandBuilder } from '#src/app/github-app/use-cases/capture-installation/capture-installation.command.builder.js'
import { CaptureInstallationRepository } from '#src/app/github-app/use-cases/capture-installation/capture-installation.repository.js'
import { CaptureInstallationUseCase } from '#src/app/github-app/use-cases/capture-installation/capture-installation.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GitHubInstallationTokenService } from '#src/modules/github-client/github-installation-token.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const command = (installationId = '777', setupAction = 'install') =>
  new CaptureInstallationCommandBuilder()
    .withInstallationId(installationId)
    .withSetupAction(setupAction)
    .build()

function provisionedApp(cipher: SecretCipherService): GitHubApp {
  const app = new GitHubApp()
  app.id = 'app-uuid'
  app.githubAppId = '42'
  app.privateKeyPemEnc = cipher.encrypt('PEMDATA')
  return app
}

function build(options: {
  app?: GitHubApp | null
  mintToken?: () => Promise<string>
  accountLogin?: string
}) {
  const cipher = new SecretCipherService()
  const app = options.app === undefined ? provisionedApp(cipher) : options.app

  const upserts: { installationId: string; appId: string }[] = []
  const repository = {
    loadProvisionedApp: () => Promise.resolve(app),
    upsertByInstallationId: (installationId: string, appId: string) => {
      upserts.push({ installationId, appId })
      const installation = new GitHubInstallation()
      installation.installationId = installationId
      installation.accountLogin = options.accountLogin
      return Promise.resolve(installation)
    },
  } as unknown as CaptureInstallationRepository

  const mintArgs: { installationId: string; privateKeyPem: string }[] = []
  const tokens = {
    getInstallationToken: (params: { installationId: string; privateKeyPem: string }) => {
      mintArgs.push(params)
      return (options.mintToken ?? (() => Promise.resolve('ghs_ok')))()
    },
  } as unknown as GitHubInstallationTokenService

  const usecase = new CaptureInstallationUseCase(repository, tokens, cipher)
  return { usecase, upserts, mintArgs }
}

describe('CaptureInstallationUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('verifies via token mint and persists the installation', async () => {
    const { usecase, upserts, mintArgs } = build({})

    const result = await usecase.execute(command('777'))

    expect(result).toEqual({ installationId: '777', accountLogin: null, connected: true })
    expect(upserts).toEqual([{ installationId: '777', appId: 'app-uuid' }])
    // The decrypted PEM (not the ciphertext) is what reaches the token service.
    expect(mintArgs[0]).toMatchObject({ installationId: '777', privateKeyPem: 'PEMDATA' })
  })

  it('surfaces a known accountLogin on the response when present', async () => {
    const { usecase } = build({ accountLogin: 'octo-org' })

    const result = await usecase.execute(command('777'))

    expect(result.accountLogin).toBe('octo-org')
  })

  it('rejects a non-install setup_action before touching GitHub', async () => {
    const { usecase, mintArgs } = build({})

    await expect(usecase.execute(command('777', 'request'))).rejects.toThrow(/setup_action/)
    expect(mintArgs).toHaveLength(0)
  })

  it('rejects when no App has been provisioned', async () => {
    const { usecase } = build({ app: null })

    await expect(usecase.execute(command('777'))).rejects.toThrow(/No provisioned GitHub App/)
  })

  it('maps a token-mint failure to a 502 without leaking the upstream error', async () => {
    const { usecase, upserts } = build({
      mintToken: () => Promise.reject(new Error('401 bad PEM')),
    })

    await expect(usecase.execute(command('777'))).rejects.toThrow(
      /Could not verify the installation/,
    )
    expect(upserts).toHaveLength(0)
  })
})
