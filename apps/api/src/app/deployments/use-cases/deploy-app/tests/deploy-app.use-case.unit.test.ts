import { before, describe, it } from 'node:test'

import { EntityManager } from '@mikro-orm/postgresql'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance, type SinonStub } from 'sinon'

import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { DeployAppCommandBuilder } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.builder.js'
import { DeployAppRepository } from '#src/app/deployments/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppUseCase } from '#src/app/deployments/use-cases/deploy-app/deploy-app.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(DeployAppRepository)
  repository.upsertApp.resolves()
  repository.createRelease.resolves()
  repository.setReleaseDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.apply.resolves()

  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')

  const cipher = createStubInstance(SecretCipherService)

  const em = createStubInstance(EntityManager)
  // Run the transactional callback inline so the wrapped repository writes execute.
  ;(em.transactional as unknown as SinonStub).callsFake((work: () => Promise<unknown>) => work())

  const usecase = new DeployAppUseCase(repository, deployBackend, config, cipher, em)
  return { usecase, repository, deployBackend, cipher }
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
    const { usecase, repository, deployBackend, cipher } = build()

    const result = await usecase.execute(command())

    expect(result.appSlug).toBe('my-app')
    expect(result.url).toBe('https://my-app.demo.marsa.cc')
    // Rollout status is not read on the deploy path — the Release stays Pending
    // until the refresh-on-read reconciliation on the list endpoint (marsa#100).
    expect(result.deployStatus).toBe(DeployStatus.Pending)

    expect(repository.upsertApp.calledOnce).toBe(true)
    expect(repository.createRelease.calledOnce).toBe(true)

    const [namespace, manifests] = deployBackend.apply.firstCall.args
    expect(namespace).toBe(OPERATOR_APPS_NAMESPACE)
    expect(manifests.deployment.spec?.template.spec?.containers[0].image).toBe('nginx:1.27')
    expect(manifests.ingressRoute.spec.routes[0].match).toBe('Host(`my-app.demo.marsa.cc`)')

    // Public image: no credentials touched, no pull Secret rendered.
    const [app] = repository.upsertApp.firstCall.args
    expect(app.imagePullCredentialsEnc).toBeNull()
    expect(cipher.encrypt.called).toBe(false)
    expect(manifests.imagePullSecret).toBeUndefined()

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('encrypts private-registry credentials at rest and materializes a pull Secret', async () => {
    const { usecase, repository, deployBackend, cipher } = build()
    const credentials = { registry: 'ghcr.io', username: 'my-org', password: 'pw-test' }
    const credentialsJson = JSON.stringify(credentials)
    cipher.encrypt.returns('opaque-cipher-token')

    const privateCommand = new DeployAppCommandBuilder()
      .withSlug('my-app')
      .withImage('nginx:1.27')
      .withContainerPort(8080)
      .withImagePullCredentials(credentials)
      .build()
    await usecase.execute(privateCommand)

    // Encrypt the exact credentials JSON; persist only the opaque ciphertext.
    expect(cipher.encrypt.calledOnceWithExactly(credentialsJson)).toBe(true)
    const [app] = repository.upsertApp.firstCall.args
    expect(app.imagePullCredentialsEnc).toBe('opaque-cipher-token')
    expect(app.imagePullCredentialsEnc).not.toContain('pw-test')

    // Render reuses the in-memory credentials — no decrypt round-trip on the deploy path.
    expect(cipher.decrypt.called).toBe(false)
    const [, manifests] = deployBackend.apply.firstCall.args
    expect(manifests.imagePullSecret?.metadata?.name).toBe('my-app-registry')
    expect(manifests.deployment.spec?.template.spec?.imagePullSecrets).toEqual([
      { name: 'my-app-registry' },
    ])
  })

  it('marks the Release Failed and rethrows when the cluster apply fails', async () => {
    const { usecase, repository, deployBackend } = build()
    const applyError = new Error('cluster unreachable')
    deployBackend.apply.rejects(applyError)

    await expect(usecase.execute(command())).rejects.toThrow(applyError)

    const [, deployStatus] = repository.setReleaseDeployStatus.firstCall.args
    expect(deployStatus).toBe(DeployStatus.Failed)
  })
})
