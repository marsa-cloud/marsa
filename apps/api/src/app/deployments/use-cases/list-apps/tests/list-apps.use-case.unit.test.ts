import { before, describe, it } from 'node:test'

import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/deployments/entities/release.builder.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import {
  type AppWithLatestRelease,
  ListAppsRepository,
} from '#src/app/deployments/use-cases/list-apps/list-apps.repository.js'
import { ListAppsUseCase } from '#src/app/deployments/use-cases/list-apps/list-apps.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const BASE_DOMAIN = 'demo.marsa.cc'

function row(slug: string, deployStatus: DeployStatus): AppWithLatestRelease {
  const app = new AppBuilder().withSlug(slug).withImage('nginx:1.27').build()
  const latestRelease = new ReleaseBuilder().withApp(app).withDeployStatus(deployStatus).build()
  return { app, latestRelease }
}

function build(rows: AppWithLatestRelease[]) {
  const repository = createStubInstance(ListAppsRepository)
  repository.listAppsWithLatestRelease.resolves(rows)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns(BASE_DOMAIN)
  const usecase = new ListAppsUseCase(repository, config)
  return { usecase, repository }
}

describe('ListAppsUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('maps each app to a summary with slug, image, public URL and current status', async () => {
    const { usecase } = build([row('alpha', DeployStatus.Succeeded)])

    const result = await usecase.execute()

    expect(result.apps).toHaveLength(1)
    expect(result.apps[0].slug).toBe('alpha')
    expect(result.apps[0].image).toBe('nginx:1.27')
    expect(result.apps[0].url).toBe('https://alpha.demo.marsa.cc')
    expect(result.apps[0].deployStatus).toBe(DeployStatus.Succeeded)
  })

  it('preserves repository ordering across multiple apps', async () => {
    const { usecase } = build([
      row('newest', DeployStatus.InProgress),
      row('older', DeployStatus.Failed),
    ])

    const result = await usecase.execute()

    expect(result.apps.map((a) => a.slug)).toEqual(['newest', 'older'])
    expect(result.apps.map((a) => a.deployStatus)).toEqual([
      DeployStatus.InProgress,
      DeployStatus.Failed,
    ])
  })

  it('returns an empty list when no apps are deployed', async () => {
    const { usecase } = build([])

    const result = await usecase.execute()

    expect(result.apps).toEqual([])
  })

  it('falls back to Pending when an app has no release', async () => {
    const app = new AppBuilder().withSlug('orphan').build()
    const { usecase } = build([{ app, latestRelease: null }])

    const result = await usecase.execute()

    expect(result.apps[0].deployStatus).toBe(DeployStatus.Pending)
  })
})
