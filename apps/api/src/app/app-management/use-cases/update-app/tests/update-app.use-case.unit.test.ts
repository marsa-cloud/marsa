import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/entities/app-placement.builder.js'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { UpdateAppCommandBuilder } from '#src/app/app-management/use-cases/update-app/update-app.command.builder.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppUseCase } from '#src/app/app-management/use-cases/update-app/update-app.use-case.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const saved = new AppBuilder().withImage('nginx:1.28').withEnv({ A: '1' }).build()

const PIN: NodePin = {
  key: 'kubernetes.io/hostname',
  values: ['node-a'],
  strategy: PinStrategy.Required,
}

// The placement is the pre-update state (unpinned); updateBySlug returns the post-update row.
const placement = new AppPlacementBuilder().withApp(new AppBuilder().build()).build()
const pinnedApp = { ...placement.app, nodePin: PIN }
const liveRelease = new ReleaseBuilder().withApp(pinnedApp).build()

function build() {
  const repository = createStubInstance(UpdateAppRepository)
  repository.updateBySlug.resolves(saved)
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.seal.returns('new-sealed')
  const deployBackend = createStubInstance(MockDeployBackend)
  const applyRelease = createStubInstance(ApplyReleaseService)
  return {
    usecase: new UpdateAppUseCase(repository, cipher, deployBackend, applyRelease),
    repository,
    cipher,
    deployBackend,
    applyRelease,
  }
}

function buildPinned() {
  const context = build()
  context.repository.updateBySlug.resolves(pinnedApp)
  context.repository.findPlacementBySlug.resolves(placement)
  context.deployBackend.readLiveReleaseUuid.resolves(liveRelease.uuid)
  context.repository.findRelease.resolves(liveRelease)
  return context
}

describe('UpdateAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('patches only the fields the command carries, leaving credentials alone when omitted', async () => {
    const { usecase, repository } = build()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withImage('nginx:1.28').build())

    const [slug, patch] = repository.updateBySlug.firstCall.args
    expect(slug).toBe('my-app')
    expect(patch).toEqual({
      image: 'nginx:1.28',
      containerPort: undefined,
      minReplicas: undefined,
      maxReplicas: undefined,
      env: undefined,
      nodePin: undefined,
      imagePullCredentialsEnc: undefined,
    })
  })

  it('clears credentials on null and seals replacements', async () => {
    const cleared = build()
    await cleared.usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withImagePullCredentials(null).build(),
    )
    expect(cleared.repository.updateBySlug.firstCall.args[1].imagePullCredentialsEnc).toBeNull()

    const replaced = build()
    const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }
    await replaced.usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withImagePullCredentials(credentials).build(),
    )
    expect(replaced.cipher.seal.calledOnceWithExactly(credentials)).toBe(true)
    expect(replaced.repository.updateBySlug.firstCall.args[1].imagePullCredentialsEnc).toBe(
      'new-sealed',
    )
  })

  it('returns the saved config without the sealed credentials', async () => {
    const { usecase } = build()

    const result = await usecase.execute('my-app', new UpdateAppCommandBuilder().build())

    expect(result).toEqual({
      slug: 'my-app',
      image: 'nginx:1.28',
      containerPort: 80,
      minReplicas: 1,
      maxReplicas: 1,
      env: { A: '1' },
      nodePin: null,
    })
  })

  it('throws NotFound when no app has the slug', async () => {
    const { usecase, repository } = build()
    repository.updateBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', new UpdateAppCommandBuilder().build())).rejects.toThrow(
      NotFoundException,
    )
  })

  it('re-applies the live release when the pin changes', async () => {
    const { usecase, applyRelease } = buildPinned()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    // Applied with the post-update app, so the manifests carry the new pin rather than the old one.
    expect(
      applyRelease.apply.calledOnceWithExactly({ ...placement, app: pinnedApp }, liveRelease),
    ).toBe(true)
  })

  it('makes no cluster call when the command carries no pin', async () => {
    const { usecase, deployBackend, applyRelease } = buildPinned()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withImage('nginx:1.28').build())

    expect(deployBackend.readLiveReleaseUuid.called).toBe(false)
    expect(applyRelease.apply.called).toBe(false)
  })

  it('stores the pin without applying when nothing is deployed', async () => {
    const { usecase, deployBackend, applyRelease } = buildPinned()
    deployBackend.readLiveReleaseUuid.resolves(null)

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    expect(applyRelease.apply.called).toBe(false)
  })

  it('makes no cluster call when the pin is sent unchanged', async () => {
    const { usecase, repository, deployBackend, applyRelease } = build()
    const pinned = new AppPlacementBuilder().withApp(pinnedApp).build()
    repository.findPlacementBySlug.resolves(pinned)
    repository.updateBySlug.resolves(pinned.app)

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    expect(deployBackend.readLiveReleaseUuid.called).toBe(false)
    expect(applyRelease.apply.called).toBe(false)
  })

  it('treats a reordered value list as unchanged', async () => {
    const { usecase, repository, applyRelease } = build()
    const multi = { ...PIN, values: ['node-a', 'node-b'] }
    const pinned = new AppPlacementBuilder().withApp({ ...placement.app, nodePin: multi }).build()
    repository.findPlacementBySlug.resolves(pinned)
    repository.updateBySlug.resolves(pinned.app)

    await usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withNodePin({ ...multi, values: ['node-b', 'node-a'] }).build(),
    )

    expect(applyRelease.apply.called).toBe(false)
  })

  it('does not query for a release when the live annotation is not a uuid', async () => {
    const { usecase, repository, deployBackend, applyRelease } = buildPinned()
    deployBackend.readLiveReleaseUuid.resolves('not-a-uuid')

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    expect(repository.findRelease.called).toBe(false)
    expect(applyRelease.apply.called).toBe(false)
  })

  it('keeps the stored pin when the apply fails', async () => {
    const { usecase, applyRelease } = buildPinned()
    applyRelease.apply.rejects(new Error('cluster unreachable'))

    await expect(
      usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build()),
    ).rejects.toThrow('cluster unreachable')
  })
})
