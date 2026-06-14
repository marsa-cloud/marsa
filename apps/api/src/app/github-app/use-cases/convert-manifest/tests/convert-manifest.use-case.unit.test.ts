import { afterEach, before, describe, it } from 'node:test'

import { expect } from 'expect'
import sinon from 'sinon'

import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { ConvertManifestCommandBuilder } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.builder.js'
import { ConvertManifestRepository } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.repository.js'
import { ConvertManifestUseCase } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { GitHubAppCredentials } from '#src/modules/github-client/github-client.types.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const CREDS: GitHubAppCredentials = {
  id: 555,
  slug: 'marsa-x',
  name: 'marsa.x',
  htmlUrl: 'https://github.com/apps/marsa-x',
  ownerLogin: 'octo',
  clientId: 'cid',
  clientSecret: 'csecret',
  webhookSecret: 'wsecret',
  pem: 'PEMDATA',
}

describe('ConvertManifestUseCase', () => {
  before(() => TestBench.setupUnitTest())
  afterEach(() => sinon.restore())

  it('encrypts credentials, persists via the repository, returns a sanitized response', async () => {
    const manifestState = sinon.createStubInstance(ManifestStateService)
    const repository = sinon.createStubInstance(ConvertManifestRepository)
    const client = sinon.createStubInstance(MockGithubClient)
    const cipher = new SecretCipherService()

    manifestState.consume.resolves(true)
    client.convertManifest.resolves(CREDS)
    repository.upsertByGithubAppId.resolves()

    const usecase = new ConvertManifestUseCase(manifestState, repository, client, cipher)
    const result = await usecase.execute(
      new ConvertManifestCommandBuilder().withCode('code123').withState('valid-state').build(),
    )

    expect(result).toEqual({
      appSlug: 'marsa-x',
      appName: 'marsa.x',
      htmlUrl: 'https://github.com/apps/marsa-x',
      installUrl: 'https://github.com/apps/marsa-x/installations/new',
    })
    const app = repository.upsertByGithubAppId.firstCall.args[0]
    expect(app.githubAppId).toBe('555')
    expect(app.clientId).toBe('cid')
    expect(app.clientSecretEnc).not.toContain('csecret')
    expect(cipher.decrypt(app.clientSecretEnc)).toBe('csecret')
    expect(cipher.decrypt(app.webhookSecretEnc)).toBe('wsecret')
    expect(cipher.decrypt(app.privateKeyPemEnc)).toBe('PEMDATA')
  })

  it('maps a null ownerLogin to undefined on the persisted app', async () => {
    const manifestState = sinon.createStubInstance(ManifestStateService)
    const repository = sinon.createStubInstance(ConvertManifestRepository)
    const client = sinon.createStubInstance(MockGithubClient)
    const cipher = new SecretCipherService()

    manifestState.consume.resolves(true)
    client.convertManifest.resolves({ ...CREDS, ownerLogin: null })
    repository.upsertByGithubAppId.resolves()

    const usecase = new ConvertManifestUseCase(manifestState, repository, client, cipher)
    await usecase.execute(
      new ConvertManifestCommandBuilder().withCode('code123').withState('valid-state').build(),
    )

    const app = repository.upsertByGithubAppId.firstCall.args[0]
    expect(app.ownerLogin).toBeUndefined()
  })

  it('rejects an invalid state before calling GitHub', async () => {
    const manifestState = sinon.createStubInstance(ManifestStateService)
    const repository = sinon.createStubInstance(ConvertManifestRepository)
    const client = sinon.createStubInstance(MockGithubClient)
    const cipher = new SecretCipherService()

    manifestState.consume.resolves(false)

    const usecase = new ConvertManifestUseCase(manifestState, repository, client, cipher)
    await expect(
      usecase.execute(
        new ConvertManifestCommandBuilder().withCode('code123').withState('bad-state').build(),
      ),
    ).rejects.toThrow(/state/)

    expect(client.convertManifest.called).toBe(false)
  })

  it('maps a GitHub failure to a 502 without leaking the upstream error', async () => {
    const manifestState = sinon.createStubInstance(ManifestStateService)
    const repository = sinon.createStubInstance(ConvertManifestRepository)
    const client = sinon.createStubInstance(MockGithubClient)
    const cipher = new SecretCipherService()

    manifestState.consume.resolves(true)
    client.convertManifest.rejects(new Error('boom'))

    const usecase = new ConvertManifestUseCase(manifestState, repository, client, cipher)
    await expect(
      usecase.execute(
        new ConvertManifestCommandBuilder().withCode('x').withState('valid-state').build(),
      ),
    ).rejects.toThrow(/Could not complete GitHub App creation/)
  })
})
