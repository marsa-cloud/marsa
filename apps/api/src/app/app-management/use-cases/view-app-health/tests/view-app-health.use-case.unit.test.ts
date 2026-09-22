import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ViewAppHealthRepository } from '#src/app/app-management/use-cases/view-app-health/view-app-health.repository.js'
import { AppHealthStatus } from '#src/app/app-management/use-cases/view-app-health/view-app-health.response.js'
import { ViewAppHealthUseCase } from '#src/app/app-management/use-cases/view-app-health/view-app-health.use-case.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import type { AppHealth } from '#src/modules/runtime/runtime.types.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const HEALTHY: AppHealth = {
  found: true,
  desiredReplicas: 1,
  availableReplicas: 1,
  updatedReplicas: 1,
}

function stubs(health: AppHealth, minReplicas = 1) {
  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.readHealth.resolves(health)
  const repository = createStubInstance(ViewAppHealthRepository)
  repository.findBySlug.resolves(
    new AppPlacementBuilder()
      .withApp(new AppBuilder().withMinReplicas(minReplicas).build())
      .build(),
  )
  return { usecase: new ViewAppHealthUseCase(repository, appRuntime), repository, appRuntime }
}

const build = (health: AppHealth, minReplicas = 1) => stubs(health, minReplicas).usecase

describe('ViewAppHealthUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('reports Healthy when available meets desired', async () => {
    const usecase = build({
      found: true,
      desiredReplicas: 2,
      availableReplicas: 2,
      updatedReplicas: 2,
    })

    const result = await usecase.execute('my-app')

    expect(result.status).toBe(AppHealthStatus.Healthy)
    expect(result.availableReplicas).toBe(2)
    expect(result.desiredReplicas).toBe(2)
  })

  it('reports Degraded when some but not all replicas are available', async () => {
    const usecase = build({
      found: true,
      desiredReplicas: 3,
      availableReplicas: 1,
      updatedReplicas: 1,
    })

    const result = await usecase.execute('my-app')

    expect(result.status).toBe(AppHealthStatus.Degraded)
  })

  it('reports Unavailable when no replicas are available', async () => {
    const usecase = build({
      found: true,
      desiredReplicas: 2,
      availableReplicas: 0,
      updatedReplicas: 0,
    })

    const result = await usecase.execute('my-app')

    expect(result.status).toBe(AppHealthStatus.Unavailable)
  })

  it('reports Idle when a scale-to-zero app is asleep', async () => {
    const usecase = build(
      { found: true, desiredReplicas: 0, availableReplicas: 0, updatedReplicas: 0 },
      0,
    )

    const result = await usecase.execute('my-app')

    expect(result.status).toBe(AppHealthStatus.Idle)
  })

  it('reports Idle while a sleeping app still has a pod draining', async () => {
    const usecase = build(
      { found: true, desiredReplicas: 0, availableReplicas: 1, updatedReplicas: 0 },
      0,
    )

    const result = await usecase.execute('my-app')

    expect(result.status).toBe(AppHealthStatus.Idle)
  })

  it('reports Unavailable when a woken scale-to-zero app has no ready pod', async () => {
    const usecase = build(
      { found: true, desiredReplicas: 1, availableReplicas: 0, updatedReplicas: 1 },
      0,
    )

    const result = await usecase.execute('my-app')

    expect(result.status).toBe(AppHealthStatus.Unavailable)
  })

  it('reports NotFound when the deployment does not exist', async () => {
    const usecase = build({
      found: false,
      desiredReplicas: 0,
      availableReplicas: 0,
      updatedReplicas: 0,
    })

    const result = await usecase.execute('my-app')

    expect(result.status).toBe(AppHealthStatus.NotFound)
  })

  it('reads health from the app environment', async () => {
    const { usecase, appRuntime } = stubs(HEALTHY)

    await usecase.execute('my-app')

    expect(appRuntime.readHealth.firstCall.args[0]).toMatchObject({
      environment: { projectSlug: 'my-project', environmentSlug: 'production' },
    })
  })

  it('throws 404 for an unknown app', async () => {
    const { usecase, repository } = stubs(HEALTHY)
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })
})
