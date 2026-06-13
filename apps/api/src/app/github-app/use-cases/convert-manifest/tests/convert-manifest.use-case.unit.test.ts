import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { ConvertManifestCommandBuilder } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.builder.js'
import { ConvertManifestRepository } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.repository.js'
import { ConvertManifestUseCase } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import type { GitHubAppCredentials } from '#src/modules/github-client/github-client.types.js'
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

// The state service is mocked, so the literal value only has to be a non-empty
// string the fake `consume` recognises — its UUID shape is irrelevant here.
const VALID_STATE = 'valid-state'

const command = (code: string, state: string = VALID_STATE) =>
  new ConvertManifestCommandBuilder().withCode(code).withState(state).build()

function build(convert: () => Promise<GitHubAppCredentials>) {
  const manifestState = {
    consume: (s: string) => Promise.resolve(s === VALID_STATE),
    issue: () => Promise.resolve(VALID_STATE),
  } as unknown as ManifestStateService
  const cipher = new SecretCipherService()
  const upserted: GitHubApp[] = []
  const repository = {
    upsertByGithubAppId: (app: GitHubApp) => Promise.resolve(void upserted.push(app)),
  } as unknown as ConvertManifestRepository
  const client = { convertManifest: convert } as unknown as GithubClient
  const usecase = new ConvertManifestUseCase(manifestState, repository, client, cipher)
  return { usecase, cipher, upserted }
}

describe('ConvertManifestUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('encrypts credentials, persists via the repository, returns a sanitized response', async () => {
    const { usecase, cipher, upserted } = build(() => Promise.resolve(CREDS))

    const result = await usecase.execute(command('code123'))

    expect(result).toEqual({
      appSlug: 'marsa-x',
      appName: 'marsa.x',
      htmlUrl: 'https://github.com/apps/marsa-x',
      installUrl: 'https://github.com/apps/marsa-x/installations/new',
    })
    expect(upserted).toHaveLength(1)
    const app = upserted[0]
    expect(app.githubAppId).toBe('555')
    expect(app.clientId).toBe('cid')
    expect(app.clientSecretEnc).not.toContain('csecret')
    expect(cipher.decrypt(app.clientSecretEnc)).toBe('csecret')
    expect(cipher.decrypt(app.webhookSecretEnc)).toBe('wsecret')
    expect(cipher.decrypt(app.privateKeyPemEnc)).toBe('PEMDATA')
  })

  it('maps a null ownerLogin to undefined on the persisted app', async () => {
    const { usecase, upserted } = build(() => Promise.resolve({ ...CREDS, ownerLogin: null }))

    await usecase.execute(command('code123'))

    expect(upserted[0].ownerLogin).toBeUndefined()
  })

  it('rejects an invalid state before calling GitHub', async () => {
    let called = false
    const { usecase } = build(() => {
      called = true
      return Promise.resolve(CREDS)
    })

    await expect(usecase.execute(command('code123', 'bad'))).rejects.toThrow(/state/)
    expect(called).toBe(false)
  })

  it('maps a GitHub failure to a 502 without leaking the upstream error', async () => {
    const { usecase } = build(() => Promise.reject(new Error('boom')))

    await expect(usecase.execute(command('x'))).rejects.toThrow(
      /Could not complete GitHub App creation/,
    )
  })
})
