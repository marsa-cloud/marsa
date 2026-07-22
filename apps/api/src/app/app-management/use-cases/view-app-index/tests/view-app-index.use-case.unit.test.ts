import { before, describe, it } from 'node:test'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.entity.js'
import { ViewAppIndexRepository } from '#src/app/app-management/use-cases/view-app-index/view-app-index.repository.js'
import { ViewAppIndexUseCase } from '#src/app/app-management/use-cases/view-app-index/view-app-index.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const BASE_DOMAIN = 'demo.marsa.cc'

function build(apps: App[]) {
  const repository = createStubInstance(ViewAppIndexRepository)
  repository.listApps.resolves(apps)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns(BASE_DOMAIN)
  const usecase = new ViewAppIndexUseCase(repository, config)
  return { usecase, repository }
}

describe('ViewAppIndexUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('maps each app to a summary with slug, image and public URL', async () => {
    const app = new AppBuilder().withSlug('alpha').withImage('nginx:1.27').build()
    const { usecase } = build([app])

    const result = await usecase.execute()

    expect(result.apps).toHaveLength(1)
    expect(result.apps[0].slug).toBe('alpha')
    expect(result.apps[0].image).toBe('nginx:1.27')
    expect(result.apps[0].url).toBe('https://alpha.demo.marsa.cc')
  })

  it('preserves repository ordering across multiple apps', async () => {
    const newest = new AppBuilder().withSlug('newest').build()
    const older = new AppBuilder().withSlug('older').build()
    const { usecase } = build([newest, older])

    const result = await usecase.execute()

    expect(result.apps.map((a) => a.slug)).toEqual(['newest', 'older'])
  })

  it('returns an empty list when no apps are deployed', async () => {
    const { usecase } = build([])

    const result = await usecase.execute()

    expect(result.apps).toEqual([])
  })
})
