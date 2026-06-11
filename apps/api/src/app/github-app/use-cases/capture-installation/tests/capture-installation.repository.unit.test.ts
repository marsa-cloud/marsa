import { before, describe, it } from 'node:test'

import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { expect } from 'expect'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'
import { CaptureInstallationRepository } from '#src/app/github-app/use-cases/capture-installation/capture-installation.repository.js'
import { TestBench } from '#src/test/setup/test-bench.js'

// `raceWinner`, when set, makes the insert reject with a unique-violation and the
// retry's findOneOrFail return the row a concurrent request inserted.
function buildUpsert(
  existing: GitHubInstallation | null,
  raceWinner: GitHubInstallation | null = null,
) {
  const persisted: GitHubInstallation[] = []
  const em = {
    fork: () => ({
      getReference: (_entity: unknown, id: string) => {
        const app = new GitHubApp()
        app.id = id
        return app
      },
      findOne: () => Promise.resolve(existing),
      findOneOrFail: () => Promise.resolve(raceWinner),
      persistAndFlush: (e: GitHubInstallation) => {
        if (raceWinner) {
          return Promise.reject(new UniqueConstraintViolationException(new Error('duplicate key')))
        }
        return Promise.resolve(void persisted.push(e))
      },
      clear: () => {},
    }),
  } as unknown as EntityManager
  return { repository: new CaptureInstallationRepository(em), persisted }
}

function buildLoad(app: GitHubApp | null) {
  const em = {
    fork: () => ({ findOne: () => Promise.resolve(app) }),
  } as unknown as EntityManager
  return new CaptureInstallationRepository(em)
}

describe('CaptureInstallationRepository', () => {
  before(() => TestBench.setupUnitTest())

  it('loadProvisionedApp returns the provisioned App', async () => {
    const app = new GitHubApp()
    app.id = 'app-uuid'
    const result = await buildLoad(app).loadProvisionedApp()
    expect(result?.id).toBe('app-uuid')
  })

  it('loadProvisionedApp returns null when none provisioned', async () => {
    expect(await buildLoad(null).loadProvisionedApp()).toBeNull()
  })

  it('inserts a new installation when none exists', async () => {
    const { repository, persisted } = buildUpsert(null)

    const result = await repository.upsertByInstallationId('777', 'app-uuid')

    expect(persisted).toHaveLength(1)
    expect(persisted[0].installationId).toBe('777')
    expect(persisted[0].app.id).toBe('app-uuid')
    expect(result.installationId).toBe('777')
  })

  it('is idempotent — returns the existing row without re-inserting', async () => {
    const existing = new GitHubInstallation()
    existing.installationId = '777'
    const { repository, persisted } = buildUpsert(existing)

    const result = await repository.upsertByInstallationId('777', 'app-uuid')

    expect(persisted).toHaveLength(0)
    expect(result).toBe(existing)
  })

  it('recovers from a lost insert race by returning the winning row', async () => {
    const winner = new GitHubInstallation()
    winner.installationId = '777'
    const { repository } = buildUpsert(null, winner)

    const result = await repository.upsertByInstallationId('777', 'app-uuid')

    expect(result).toBe(winner)
  })
})
