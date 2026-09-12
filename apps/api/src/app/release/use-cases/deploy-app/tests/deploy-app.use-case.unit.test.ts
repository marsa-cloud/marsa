import { before, describe, it } from 'node:test'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { DeployAppCommandBuilder } from '#src/app/release/use-cases/deploy-app/deploy-app.command.builder.js'
import type { DeployAppCommand } from '#src/app/release/use-cases/deploy-app/deploy-app.command.js'
import { DeployAppRepository } from '#src/app/release/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppUseCase } from '#src/app/release/use-cases/deploy-app/deploy-app.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(DeployAppRepository)
  repository.findAppBySlug.resolves(undefined)
  repository.upsertApp.callsFake((_tx, app) => Promise.resolve(app.uuid))
  repository.createRelease.resolves()
  repository.setReleaseDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.apply.resolves()

  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')

  const cipher = createStubInstance(ImagePullCredentialsCipher)

  // Real ApplyReleaseService over the stubbed backend: rendering is the
  // behaviour under test here, so only the cluster call is faked.
  const applyRelease = new ApplyReleaseService(deployBackend, config)

  const usecase = new DeployAppUseCase(stubDatabase(), repository, applyRelease, cipher)
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

    // App + Release are written atomically inside the use-case transaction.
    expect(repository.upsertApp.calledOnce).toBe(true)
    expect(repository.createRelease.calledOnce).toBe(true)

    const [namespace, manifests] = deployBackend.apply.firstCall.args
    expect(namespace).toBe(OPERATOR_APPS_NAMESPACE)
    expect(manifests.deployment.spec?.template.spec?.containers[0].image).toBe('nginx:1.27')
    expect(manifests.ingressRoute.spec.routes[0].match).toBe('Host(`my-app.demo.marsa.cc`)')

    // Public image: no credentials touched, no pull Secret rendered.
    const [, app] = repository.upsertApp.firstCall.args
    expect(app.imagePullCredentialsEnc).toBeNull()
    expect(cipher.seal.called).toBe(false)
    expect(manifests.imagePullSecret).toBeUndefined()

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('encrypts private-registry credentials at rest and materializes a pull Secret', async () => {
    const { usecase, repository, deployBackend, cipher } = build()
    const credentials = { registry: 'ghcr.io', username: 'my-org', password: 'pw-test' }
    cipher.seal.returns('opaque-cipher-token')

    const privateCommand = new DeployAppCommandBuilder()
      .withSlug('my-app')
      .withImage('nginx:1.27')
      .withContainerPort(8080)
      .withImagePullCredentials(credentials)
      .build()
    await usecase.execute(privateCommand)

    // Seal the exact credentials; persist only the opaque ciphertext.
    expect(cipher.seal.calledOnceWithExactly(credentials)).toBe(true)
    const [, app] = repository.upsertApp.firstCall.args
    expect(app.imagePullCredentialsEnc).toBe('opaque-cipher-token')
    expect(app.imagePullCredentialsEnc).not.toContain('pw-test')

    // Render reuses the in-memory credentials — no open() round-trip on the deploy path.
    expect(cipher.open.called).toBe(false)
    const [, manifests] = deployBackend.apply.firstCall.args
    expect(manifests.imagePullSecret?.metadata?.name).toBe('my-app-registry')
    expect(manifests.deployment.spec?.template.spec?.imagePullSecrets).toEqual([
      { name: 'my-app-registry' },
    ])
  })

  describe('replica range', () => {
    async function persistedRange(cmd: DeployAppCommand, existing?: App) {
      const { usecase, repository } = build()
      if (existing) {
        repository.findAppBySlug.resolves(existing)
      }

      await usecase.execute(cmd)

      const [, app] = repository.upsertApp.firstCall.args
      return { min: app.minReplicas, max: app.maxReplicas }
    }

    const withRange = (min?: number, max?: number) => {
      const builder = new DeployAppCommandBuilder().withSlug('my-app').withImage('nginx:1.27')
      if (min !== undefined) builder.withMinReplicas(min)
      if (max !== undefined) builder.withMaxReplicas(max)
      return builder.build()
    }

    it('defaults a new app to a single always-on replica', async () => {
      expect(await persistedRange(withRange())).toEqual({ min: 1, max: 1 })
    })

    it('lifts the ceiling to the floor when only a floor is sent', async () => {
      expect(await persistedRange(withRange(4, undefined))).toEqual({ min: 4, max: 4 })
    })

    it('keeps the floor at 1 when only a ceiling is sent', async () => {
      expect(await persistedRange(withRange(undefined, 3))).toEqual({ min: 1, max: 3 })
    })

    it('keeps the stored range when a redeploy omits it', async () => {
      const existing = new AppBuilder().withMinReplicas(0).withMaxReplicas(10).build()

      expect(await persistedRange(withRange(), existing)).toEqual({ min: 0, max: 10 })
    })

    it('raises a stored ceiling that a new floor would overtake', async () => {
      const existing = new AppBuilder().withMinReplicas(0).withMaxReplicas(2).build()

      expect(await persistedRange(withRange(5, undefined), existing)).toEqual({ min: 5, max: 5 })
    })

    it('honours an explicit ceiling that narrows the stored range', async () => {
      const existing = new AppBuilder().withMinReplicas(0).withMaxReplicas(10).build()

      expect(await persistedRange(withRange(undefined, 2), existing)).toEqual({ min: 0, max: 2 })
    })
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
