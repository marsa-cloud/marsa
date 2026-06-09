import { before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { expect } from 'expect'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { ConvertManifestUseCase } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { GitHubAppCredentials } from '#src/modules/github-client/github-client.types.js'
import { GitHubManifestClient } from '#src/modules/github-client/github-manifest.client.js'
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

function build(convert: () => Promise<GitHubAppCredentials>) {
  const signer = new StateSigner()
  const cipher = new SecretCipherService()
  const persisted: GitHubApp[] = []
  const em = {
    fork: () => ({ persistAndFlush: (e: GitHubApp) => Promise.resolve(void persisted.push(e)) }),
  } as unknown as EntityManager
  const client = { convertManifest: convert } as unknown as GitHubManifestClient
  const usecase = new ConvertManifestUseCase(em, signer, client, cipher)
  return { usecase, signer, cipher, persisted }
}

describe('ConvertManifestUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('persists encrypted credentials and returns a sanitized response', async () => {
    const { usecase, signer, cipher, persisted } = build(() => Promise.resolve(CREDS))

    const result = await usecase.execute({ code: 'code123', state: signer.sign() })

    expect(result).toEqual({
      appSlug: 'marsa-x',
      appName: 'marsa.x',
      htmlUrl: 'https://github.com/apps/marsa-x',
      installUrl: 'https://github.com/apps/marsa-x/installations/new',
    })
    expect(persisted).toHaveLength(1)
    const row = persisted[0]
    expect(row.githubAppId).toBe('555')
    expect(row.clientId).toBe('cid')
    expect(row.clientSecretEnc).not.toContain('csecret')
    expect(cipher.decrypt(row.clientSecretEnc)).toBe('csecret')
    expect(cipher.decrypt(row.webhookSecretEnc)).toBe('wsecret')
    expect(cipher.decrypt(row.privateKeyPemEnc)).toBe('PEMDATA')
  })

  it('persists a null ownerLogin as undefined', async () => {
    const { usecase, signer, persisted } = build(() =>
      Promise.resolve({ ...CREDS, ownerLogin: null }),
    )

    await usecase.execute({ code: 'code123', state: signer.sign() })

    expect(persisted[0].ownerLogin).toBeUndefined()
  })

  it('rejects an invalid state before calling GitHub', async () => {
    let called = false
    const { usecase } = build(() => {
      called = true
      return Promise.resolve(CREDS)
    })

    await expect(usecase.execute({ code: 'code123', state: 'bad' })).rejects.toThrow(/state/)
    expect(called).toBe(false)
  })

  it('rejects a missing or non-string code', async () => {
    const { usecase, signer } = build(() => Promise.resolve(CREDS))

    await expect(usecase.execute({ code: '', state: signer.sign() })).rejects.toThrow(/code/)
    await expect(
      usecase.execute({ code: 123 as unknown as string, state: signer.sign() }),
    ).rejects.toThrow(/code/)
  })

  it('rejects a non-string state without throwing a 500', async () => {
    const { usecase } = build(() => Promise.resolve(CREDS))

    await expect(
      usecase.execute({ code: 'code123', state: 42 as unknown as string }),
    ).rejects.toThrow(/state/)
  })

  it('maps a GitHub failure to a 502 without leaking the upstream error', async () => {
    const { usecase, signer } = build(() => Promise.reject(new Error('boom')))

    await expect(usecase.execute({ code: 'x', state: signer.sign() })).rejects.toThrow(
      /Could not complete GitHub App creation/,
    )
  })
})
