import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ViewAppHealthRepository } from '#src/app/app-management/use-cases/view-app-health/view-app-health.repository.js'
import { AppHealthStatus } from '#src/app/app-management/use-cases/view-app-health/view-app-health.response.js'
import { ViewAppHealthUseCase } from '#src/app/app-management/use-cases/view-app-health/view-app-health.use-case.js'
import type { AppHealth } from '#src/modules/kubernetes/deploy-backend.types.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build(health: AppHealth, minReplicas = 1) {
  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.readAppHealth.resolves(health)
  const repository = createStubInstance(ViewAppHealthRepository)
  repository.findBySlug.resolves(new AppBuilder().withMinReplicas(minReplicas).build())
  return new ViewAppHealthUseCase(repository, deployBackend)
}

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
})
