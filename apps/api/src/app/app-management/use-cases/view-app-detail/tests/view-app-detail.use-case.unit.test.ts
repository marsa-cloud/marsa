import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ViewAppDetailRepository } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.js'
import { ViewAppDetailUseCase } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.use-case.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(ViewAppDetailRepository)
  repository.findNewestNonFailedRelease.resolves(undefined)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const usecase = new ViewAppDetailUseCase(repository, config)
  return { repository, usecase }
}

describe('ViewAppDetailUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the public URL from the slug and the configured base domain', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(
      new AppBuilder().withSlug('my-app').withEnv({ LOG_LEVEL: 'info' }).build(),
    )

    const response = await usecase.execute('my-app')

    expect(response.url).toBe('https://my-app.demo.marsa.cc')
    expect(response.env).toEqual({ LOG_LEVEL: 'info' })
  })

  it('throws 404 for an unknown slug', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })
  it('reports undeployed changes until the saved config matches the newest release', async () => {
    const { repository, usecase } = build()
    const app = new AppBuilder().withSlug('my-app').withEnv({ A: '1' }).build()
    repository.findBySlug.resolves(app)

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(true)

    repository.findNewestNonFailedRelease.resolves(new ReleaseBuilder().withApp(app).build())
    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(false)

    repository.findNewestNonFailedRelease.resolves(
      new ReleaseBuilder().withApp({ ...app, env: { A: 'old' } }).build(),
    )
    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(true)
  })
  it('keeps warning when the release that matches the saved config failed to deploy', async () => {
    const { repository, usecase } = build()
    const app = new AppBuilder().withSlug('my-app').withEnv({ A: 'new' }).build()
    repository.findBySlug.resolves(app)
    repository.findNewestNonFailedRelease.resolves(
      new ReleaseBuilder()
        .withApp({ ...app, env: { A: 'old' } })
        .withDeployStatus(DeployStatus.Succeeded)
        .build(),
    )

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(true)
  })
})
