import { before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/core'
import { expect } from 'expect'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import {
  type GitHubAppCredentials,
  GitHubManifestClient,
} from '#src/app/github-app/github-manifest.client.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { ConvertManifestService } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.service.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
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
  const service = new ConvertManifestService(em, signer, client, cipher)
  return { service, signer, cipher, persisted }
}

describe('ConvertManifestService', () => {
  before(() => TestBench.setupUnitTest())

  it('persists encrypted credentials and returns a sanitized response', async () => {
    const { service, signer, cipher, persisted } = build(() => Promise.resolve(CREDS))

    const result = await service.execute({ code: 'code123', state: signer.sign() })

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
    const { service, signer, persisted } = build(() =>
      Promise.resolve({ ...CREDS, ownerLogin: null }),
    )

    await service.execute({ code: 'code123', state: signer.sign() })

    expect(persisted[0].ownerLogin).toBeUndefined()
  })

  it('rejects an invalid state before calling GitHub', async () => {
    let called = false
    const { service } = build(() => {
      called = true
      return Promise.resolve(CREDS)
    })

    await expect(service.execute({ code: 'code123', state: 'bad' })).rejects.toThrow(/state/)
    expect(called).toBe(false)
  })

  it('rejects a missing code', async () => {
    const { service, signer } = build(() => Promise.resolve(CREDS))

    await expect(service.execute({ code: '', state: signer.sign() })).rejects.toThrow(/code/)
  })

  it('maps a GitHub failure to a 502', async () => {
    const { service, signer } = build(() => Promise.reject(new Error('boom')))

    await expect(service.execute({ code: 'x', state: signer.sign() })).rejects.toThrow(/boom/)
  })
})
