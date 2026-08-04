import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { RedeployAppRepository } from '#src/app/release/use-cases/redeploy-app/redeploy-app.repository.js'
import { RedeployAppUseCase } from '#src/app/release/use-cases/redeploy-app/redeploy-app.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const storedApp = (imagePullCredentialsEnc: string | null = null) =>
  new AppBuilder()
    .withSlug('my-app')
    .withImage('nginx:1.27')
    .withContainerPort(8080)
    .withEnv({ LOG_LEVEL: 'info' })
    .withImagePullCredentialsEnc(imagePullCredentialsEnc)
    .build()

function build(app = storedApp()) {
  const repository = createStubInstance(RedeployAppRepository)
  repository.findAppBySlug.resolves(app)
  repository.createRelease.resolves()
  repository.setReleaseDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.apply.resolves()

  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')

  const cipher = createStubInstance(SecretCipherService)

  const applyRelease = new ApplyReleaseService(deployBackend, config)
  const usecase = new RedeployAppUseCase(repository, applyRelease, cipher)
  return { usecase, repository, deployBackend, cipher }
}

describe('RedeployAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('creates a new Release from the stored config and re-applies it', async () => {
    const { usecase, repository, deployBackend } = build()

    const result = await usecase.execute('my-app')

    expect(result.appSlug).toBe('my-app')
    expect(result.url).toBe('https://my-app.demo.marsa.cc')
    expect(result.deployStatus).toBe(DeployStatus.Pending)

    const [release] = repository.createRelease.firstCall.args
    expect(release.imageRef).toBe('nginx:1.27')
    expect(release.triggeredBy).toBe(ReleaseTrigger.Manual)
    expect(release.uuid).toBe(result.releaseUuid)

    // Config comes from the stored app row, not from a request body.
    const [namespace, manifests] = deployBackend.apply.firstCall.args
    expect(namespace).toBe(OPERATOR_APPS_NAMESPACE)
    const container = manifests.deployment.spec?.template.spec?.containers[0]
    expect(container?.image).toBe('nginx:1.27')
    expect(container?.ports?.[0].containerPort).toBe(8080)
    expect(container?.env).toEqual([{ name: 'LOG_LEVEL', value: 'info' }])

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('decrypts stored pull credentials and re-materializes the pull Secret', async () => {
    const credentials = { registry: 'ghcr.io', username: 'my-org', password: 'pw-test' }
    const { usecase, deployBackend, cipher } = build(storedApp('opaque-cipher-token'))
    cipher.decrypt.returns(JSON.stringify(credentials))

    await usecase.execute('my-app')

    expect(cipher.decrypt.calledOnceWithExactly('opaque-cipher-token')).toBe(true)
    const [, manifests] = deployBackend.apply.firstCall.args
    expect(manifests.imagePullSecret?.metadata?.name).toBe('my-app-registry')
    expect(manifests.deployment.spec?.template.spec?.imagePullSecrets).toEqual([
      { name: 'my-app-registry' },
    ])
  })

  it('leaves credentials untouched for a public image', async () => {
    const { usecase, deployBackend, cipher } = build()

    await usecase.execute('my-app')

    expect(cipher.decrypt.called).toBe(false)
    const [, manifests] = deployBackend.apply.firstCall.args
    expect(manifests.imagePullSecret).toBeUndefined()
  })

  it('marks the Release Failed and rethrows when the cluster apply fails', async () => {
    const { usecase, repository, deployBackend } = build()
    const applyError = new Error('cluster unreachable')
    deployBackend.apply.rejects(applyError)

    await expect(usecase.execute('my-app')).rejects.toThrow(applyError)

    const [, deployStatus] = repository.setReleaseDeployStatus.firstCall.args
    expect(deployStatus).toBe(DeployStatus.Failed)
  })

  it('throws NotFound and writes nothing when the app does not exist', async () => {
    const { usecase, repository, deployBackend } = build()
    repository.findAppBySlug.resolves(undefined)

    await expect(usecase.execute('ghost-app')).rejects.toThrow(NotFoundException)

    expect(repository.createRelease.called).toBe(false)
    expect(deployBackend.apply.called).toBe(false)
  })
})
