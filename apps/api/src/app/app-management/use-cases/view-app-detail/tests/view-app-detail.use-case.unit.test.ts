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
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { InvalidReleaseAnnotationError } from '#src/modules/runtime/runtime.errors.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').withEnv({ A: '1' }).build())
  .build()
const app = placement.app

function build() {
  const repository = createStubInstance(ViewAppDetailRepository)
  repository.findBySlug.resolves(placement)
  repository.findRelease.resolves(undefined)
  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.readLiveReleaseUuid.resolves(null)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const usecase = new ViewAppDetailUseCase(repository, appRuntime, config)
  return { repository, appRuntime, usecase }
}

describe('ViewAppDetailUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the public URL from the slug and the configured base domain', async () => {
    const { usecase } = build()

    const response = await usecase.execute('my-app')

    expect(response.url).toBe('https://my-app.demo.marsa.cc')
    expect(response.env).toEqual({ A: '1' })
  })

  it('reads the live release from the app environment and names its placement', async () => {
    const { appRuntime, usecase } = build()

    const response = await usecase.execute('my-app')

    expect(appRuntime.readLiveReleaseUuid.calledOnce).toBe(true)
    expect(appRuntime.readLiveReleaseUuid.firstCall.args[0]).toMatchObject({
      app: { slug: 'my-app' },
      project: { slug: 'my-project' },
      environment: { slug: 'production' },
    })
    expect(response.project).toEqual({ slug: 'my-project', name: 'My Project' })
    expect(response.environment).toMatchObject({ slug: 'production', name: 'Production' })
  })

  it('reports undeployed changes when nothing is running', async () => {
    const { usecase } = build()

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(true)
  })

  it('reports no changes when the running release matches the saved config', async () => {
    const { repository, appRuntime, usecase } = build()
    const running = new ReleaseBuilder().withApp(app).build()
    appRuntime.readLiveReleaseUuid.resolves(running.uuid)
    repository.findRelease.resolves(running)

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(false)
    expect(repository.findRelease.calledOnceWith(running.uuid, app.uuid)).toBe(true)
  })

  it('reports changes when the running release predates the saved config', async () => {
    const { repository, appRuntime, usecase } = build()
    const running = new ReleaseBuilder().withApp({ ...app, env: { A: 'old' } }).build()
    appRuntime.readLiveReleaseUuid.resolves(running.uuid)
    repository.findRelease.resolves(running)

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(true)
  })

  it('does not warn when the cluster cannot be read', async () => {
    const { appRuntime, usecase } = build()
    appRuntime.readLiveReleaseUuid.rejects(new Error('cluster unreachable'))

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(false)
  })

  it('throws 404 for an unknown slug', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('surfaces a malformed release annotation instead of hiding it as "no changes"', async () => {
    const { usecase, appRuntime } = build()
    appRuntime.readLiveReleaseUuid.rejects(new InvalidReleaseAnnotationError('bad annotation'))

    await expect(usecase.execute('my-app')).rejects.toThrow(InvalidReleaseAnnotationError)
  })

  it('still reports no undeployed changes when the cluster is unreachable', async () => {
    const { usecase, appRuntime } = build()
    appRuntime.readLiveReleaseUuid.rejects(new Error('ECONNREFUSED'))

    const response = await usecase.execute('my-app')

    expect(response.hasUndeployedChanges).toBe(false)
  })

  it('reports no undeployed changes before the first build, since nothing can be deployed', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(
      new AppPlacementBuilder().withApp(new AppBuilder().withImage(null).build()).build(),
    )

    expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(false)
  })
})
