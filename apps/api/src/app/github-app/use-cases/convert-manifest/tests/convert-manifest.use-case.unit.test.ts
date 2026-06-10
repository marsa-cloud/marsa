import { before, describe, it } from 'node:test'

import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { expect } from 'expect'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { ConvertManifestCommandBuilder } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.builder.js'
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

// The state service is mocked, so the literal value only has to be a non-empty
// string the fake `consume` recognises — its UUID shape is irrelevant here.
const VALID_STATE = 'valid-state'

const command = (code: string, state: string = VALID_STATE) =>
  new ConvertManifestCommandBuilder().withCode(code).withState(state).build()

// `raceWinner`, when set, simulates a lost insert race: findOne sees no row, the
// insert throws a unique-violation, and the retry's findOneOrFail returns the row
// a concurrent request inserted.
function build(
  convert: () => Promise<GitHubAppCredentials>,
  existing: GitHubApp | null = null,
  raceWinner: GitHubApp | null = null,
) {
  const manifestState = {
    consume: (s: string) => Promise.resolve(s === VALID_STATE),
    issue: () => Promise.resolve(VALID_STATE),
  } as unknown as ManifestStateService
  const cipher = new SecretCipherService()
  const persisted: GitHubApp[] = []
  const em = {
    fork: () => ({
      findOne: () => Promise.resolve(existing),
      findOneOrFail: () => Promise.resolve(raceWinner),
      persistAndFlush: (e: GitHubApp) => {
        if (raceWinner) {
          return Promise.reject(new UniqueConstraintViolationException(new Error('duplicate key')))
        }
        return Promise.resolve(void persisted.push(e))
      },
      assign: (target: GitHubApp, data: Partial<GitHubApp>) => Object.assign(target, data),
      flush: () => Promise.resolve(),
      clear: () => {},
    }),
  } as unknown as EntityManager
  const client = { convertManifest: convert } as unknown as GitHubManifestClient
  const usecase = new ConvertManifestUseCase(em, manifestState, client, cipher)
  return { usecase, cipher, persisted, existing }
}

describe('ConvertManifestUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('persists encrypted credentials and returns a sanitized response', async () => {
    const { usecase, cipher, persisted } = build(() => Promise.resolve(CREDS))

    const result = await usecase.execute(command('code123'))

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
    const { usecase, persisted } = build(() => Promise.resolve({ ...CREDS, ownerLogin: null }))

    await usecase.execute(command('code123'))

    expect(persisted[0].ownerLogin).toBeUndefined()
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

  it('updates the existing row instead of inserting a duplicate (idempotent)', async () => {
    const existing = new GitHubApp()
    existing.githubAppId = '555'
    existing.slug = 'stale-slug'
    const { usecase, cipher, persisted } = build(() => Promise.resolve(CREDS), existing)

    await usecase.execute(command('code123'))

    expect(persisted).toHaveLength(0)
    expect(existing.slug).toBe('marsa-x')
    expect(cipher.decrypt(existing.clientSecretEnc)).toBe('csecret')
  })

  it('recovers from a lost insert race by updating the winning row', async () => {
    const raceWinner = new GitHubApp()
    raceWinner.githubAppId = '555'
    raceWinner.slug = 'stale-slug'
    const { usecase, cipher } = build(() => Promise.resolve(CREDS), null, raceWinner)

    await usecase.execute(command('code123'))

    expect(raceWinner.slug).toBe('marsa-x')
    expect(cipher.decrypt(raceWinner.clientSecretEnc)).toBe('csecret')
  })
})
