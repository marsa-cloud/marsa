import { before, describe, it } from 'node:test'

import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { expect } from 'expect'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { ConvertManifestRepository } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.repository.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function makeApp(): GitHubApp {
  const app = new GitHubApp()
  app.githubAppId = '555'
  app.slug = 'marsa-x'
  app.name = 'marsa.x'
  app.htmlUrl = 'https://github.com/apps/marsa-x'
  app.clientId = 'cid'
  app.clientSecretEnc = 'enc1'
  app.webhookSecretEnc = 'enc2'
  app.privateKeyPemEnc = 'enc3'
  return app
}

// `raceWinner`, when set, makes the insert reject with a unique-violation and the
// retry's findOneOrFail return the row a concurrent request inserted.
function build(existing: GitHubApp | null, raceWinner: GitHubApp | null = null) {
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
  return { repository: new ConvertManifestRepository(em), persisted }
}

describe('ConvertManifestRepository.upsertByGithubAppId', () => {
  before(() => TestBench.setupUnitTest())

  it('inserts a new app when none exists', async () => {
    const { repository, persisted } = build(null)

    await repository.upsertByGithubAppId(makeApp())

    expect(persisted).toHaveLength(1)
    expect(persisted[0].githubAppId).toBe('555')
  })

  it('updates the existing row instead of inserting a duplicate', async () => {
    const existing = new GitHubApp()
    existing.githubAppId = '555'
    existing.slug = 'stale-slug'
    const { repository, persisted } = build(existing)

    await repository.upsertByGithubAppId(makeApp())

    expect(persisted).toHaveLength(0)
    expect(existing.slug).toBe('marsa-x')
    expect(existing.clientSecretEnc).toBe('enc1')
  })

  it('recovers from a lost insert race by updating the winning row', async () => {
    const winner = new GitHubApp()
    winner.githubAppId = '555'
    winner.slug = 'stale-slug'
    const { repository } = build(null, winner)

    await repository.upsertByGithubAppId(makeApp())

    expect(winner.slug).toBe('marsa-x')
    expect(winner.clientSecretEnc).toBe('enc1')
  })
})
