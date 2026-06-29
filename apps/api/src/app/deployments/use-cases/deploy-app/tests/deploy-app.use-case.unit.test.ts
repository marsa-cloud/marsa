import { before, describe, it } from 'node:test'

import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import { ReleaseStatus } from '#src/app/deployments/enums/release-status.enum.js'
import { DeployAppCommandBuilder } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.builder.js'
import { DeployAppRepository } from '#src/app/deployments/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppUseCase } from '#src/app/deployments/use-cases/deploy-app/deploy-app.use-case.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import type { RolloutPhase } from '#src/modules/kubernetes/deploy-backend.types.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build(phase: RolloutPhase = 'available') {
  const repository = createStubInstance(DeployAppRepository)
  repository.upsertAppAndCreateRelease.resolves()
  repository.setReleaseStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.apply.resolves()
  deployBackend.rolloutStatus.resolves(phase)

  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')

  const usecase = new DeployAppUseCase(repository, deployBackend, config)
  return { usecase, repository, deployBackend }
}

const command = () =>
  new DeployAppCommandBuilder()
    .withSlug('my-app')
    .withImage('nginx:1.27')
    .withContainerPort(8080)
    .withEnv({ LOG_LEVEL: 'info' })
    .build()

describe('DeployAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('persists the deploy, applies the rendered bundle, and returns the public URL', async () => {
    const { usecase, repository, deployBackend } = build('available')

    const result = await usecase.execute(command())

    expect(result.appSlug).toBe('my-app')
    expect(result.url).toBe('https://my-app.demo.marsa.cc')
    expect(result.status).toBe(ReleaseStatus.Succeeded)

    expect(repository.upsertAppAndCreateRelease.calledOnce).toBe(true)

    const [namespace, manifests] = deployBackend.apply.firstCall.args
    expect(namespace).toBe(OPERATOR_APPS_NAMESPACE)
    expect(manifests.deployment.spec?.template.spec?.containers[0].image).toBe('nginx:1.27')
    expect(manifests.ingressRoute.spec.routes[0].match).toBe('Host(`my-app.demo.marsa.cc`)')

    expect(repository.setReleaseStatus.calledOnceWith(result.releaseUuid, ReleaseStatus.Succeeded)).toBe(
      true,
    )
  })

  it('maps a still-progressing rollout to InProgress', async () => {
    const { usecase, repository } = build('progressing')

    const result = await usecase.execute(command())

    expect(result.status).toBe(ReleaseStatus.InProgress)
    expect(repository.setReleaseStatus.calledOnceWith(result.releaseUuid, ReleaseStatus.InProgress)).toBe(
      true,
    )
  })
})
