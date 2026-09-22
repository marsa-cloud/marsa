import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ViewAppDetailRepository } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.js'
import { ViewAppDetailUseCase } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.use-case.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { InvalidReleaseAnnotationError } from '#src/modules/kubernetes/deploy-backend.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').withEnv({ A: '1' }).build())
  .build()
const app = placement.app

function build() {
  const repository = createStubInstance(ViewAppDetailRepository)
  repository.findBySlug.resolves(placement)
  repository.findRelease.resolves(undefined)
  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.readLiveReleaseUuid.resolves(null)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const usecase = new ViewAppDetailUseCase(repository, deployBackend, config)
  return { repository, deployBackend, usecase }
}

describe('ViewAppDetailUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the public URL from the slug and the configured base domain', async () => {
    const { usecase } = build()

    const response = await usecase.execute('my-app')

    expect(response.url).toBe('https://my-app.demo.marsa.cc')
    expect(response.env).toEqual({ A: '1' })
  })

  it('reads the live release from the app namespace and names its placement', async () => {
    const { deployBackend, usecase } = build()

    const response = await usecase.execute('my-app')

    expect(
      deployBackend.readLiveReleaseUuid.calledOnceWith('my-project-production', 'my-app'),
    ).toBe(true)
    expect(response.project).toEqual({ slug: 'my-project', name: 'My Project' })
    expect(response.environment).toMatchObject({ slug: 'production', name: 'Production' })
  })

  it('reports undeployed changes when nothing is running', async () => {
    const { usecase } = build()

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(true)
  })

  it('reports no changes when the running release matches the saved config', async () => {
    const { repository, deployBackend, usecase } = build()
    const running = new ReleaseBuilder().withApp(app).build()
    deployBackend.readLiveReleaseUuid.resolves(running.uuid)
    repository.findRelease.resolves(running)

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(false)
    expect(repository.findRelease.calledOnceWith(running.uuid, app.uuid)).toBe(true)
  })

  it('reports changes when the running release predates the saved config', async () => {
    const { repository, deployBackend, usecase } = build()
    const running = new ReleaseBuilder().withApp({ ...app, env: { A: 'old' } }).build()
    deployBackend.readLiveReleaseUuid.resolves(running.uuid)
    repository.findRelease.resolves(running)

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(true)
  })

  it('does not warn when the cluster cannot be read', async () => {
    const { deployBackend, usecase } = build()
    deployBackend.readLiveReleaseUuid.rejects(new Error('cluster unreachable'))

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(false)
  })

  it('throws 404 for an unknown slug', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('surfaces a malformed release annotation instead of hiding it as "no changes"', async () => {
    const { usecase, deployBackend } = build()
    deployBackend.readLiveReleaseUuid.rejects(new InvalidReleaseAnnotationError('bad annotation'))

    await expect(usecase.execute('my-app')).rejects.toThrow(InvalidReleaseAnnotationError)
  })

  it('still reports no undeployed changes when the cluster is unreachable', async () => {
    const { usecase, deployBackend } = build()
    deployBackend.readLiveReleaseUuid.rejects(new Error('ECONNREFUSED'))

    const response = await usecase.execute('my-app')

    expect(response.hasUndeployedChanges).toBe(false)
  })
})
