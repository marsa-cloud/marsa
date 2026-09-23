import { before, describe, it } from 'node:test'
import { InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { UpdateAppCommandBuilder } from '#src/app/app-management/use-cases/update-app/update-app.command.builder.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppUseCase } from '#src/app/app-management/use-cases/update-app/update-app.use-case.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { NodePinStrategy } from '#src/modules/runtime/runtime.enums.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
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
  repository.findPlacementBySlug.resolves(placement)
  repository.updateBySlug.resolves(saved)
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.seal.returns('new-sealed')
  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.deploy.resolves()
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const imageRegistry = createStubInstance(MockImageRegistry)
  imageRegistry.pullCredentialsFor.returns(undefined)
  return {
    usecase: new UpdateAppUseCase(
      stubDatabase(),
      repository,
      cipher,
      appRuntime,
      imageRegistry,
      config,
    ),
    repository,
    cipher,
    appRuntime,
    imageRegistry,
  }
}

function buildPinned() {
  const context = build()
  context.repository.updateBySlug.resolves(pinnedApp)
  context.repository.findPlacementBySlug.resolves(placement)
  context.appRuntime.readLiveReleaseUuid.resolves(liveRelease.uuid)
  context.repository.findRelease.resolves(liveRelease)
  return context
}

describe('UpdateAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('patches only the fields the command carries, leaving credentials alone when omitted', async () => {
    const { usecase, repository } = build()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withImage('nginx:1.28').build())

    const [, slug, patch] = repository.updateBySlug.firstCall.args
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
    expect(cleared.repository.updateBySlug.firstCall.args[2].imagePullCredentialsEnc).toBeNull()

    const replaced = build()
    const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }
    await replaced.usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withImagePullCredentials(credentials).build(),
    )
    expect(replaced.cipher.seal.calledOnceWithExactly(credentials)).toBe(true)
    expect(replaced.repository.updateBySlug.firstCall.args[2].imagePullCredentialsEnc).toBe(
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
    repository.findPlacementBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', new UpdateAppCommandBuilder().build())).rejects.toThrow(
      NotFoundException,
    )
    expect(repository.updateBySlug.called).toBe(false)
  })

  it('re-applies the live release when the pin changes', async () => {
    const { usecase, appRuntime } = buildPinned()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    // Deployed with the incoming pin, not the stored one, so the runtime gets the new placement.
    expect(appRuntime.deploy.calledOnce).toBe(true)
    const [ref, spec] = appRuntime.deploy.firstCall.args
    expect(ref.app.slug).toBe(placement.app.slug)
    expect(spec.releaseUuid).toBe(liveRelease.uuid)
    expect(spec.nodePin).toEqual({
      key: 'kubernetes.io/hostname',
      values: ['node-a'],
      strategy: NodePinStrategy.Required,
    })
  })

  it('re-applies a Marsa-registry image with Marsa credentials, not the stored ones', async () => {
    const { usecase, appRuntime, cipher, imageRegistry } = buildPinned()
    const marsaCredentials = {
      registry: 'registry.demo.marsa.cc',
      username: 'marsa-pull',
      password: 'p',
    }
    imageRegistry.pullCredentialsFor.returns(marsaCredentials)

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    expect(appRuntime.deploy.firstCall.args[1].credentials).toEqual(marsaCredentials)
    expect(cipher.openForApp.called).toBe(false)
  })

  it('makes no cluster call when the command carries no pin', async () => {
    const { usecase, appRuntime } = buildPinned()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withImage('nginx:1.28').build())

    expect(appRuntime.readLiveReleaseUuid.called).toBe(false)
    expect(appRuntime.deploy.called).toBe(false)
  })

  it('stores the pin without applying when nothing is deployed', async () => {
    const { usecase, appRuntime } = buildPinned()
    appRuntime.readLiveReleaseUuid.resolves(null)

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    expect(appRuntime.deploy.called).toBe(false)
  })

  it('makes no cluster call when the pin is sent unchanged', async () => {
    const { usecase, repository, appRuntime } = build()
    const pinned = new AppPlacementBuilder().withApp(pinnedApp).build()
    repository.findPlacementBySlug.resolves(pinned)
    repository.updateBySlug.resolves(pinned.app)

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    expect(appRuntime.readLiveReleaseUuid.called).toBe(false)
    expect(appRuntime.deploy.called).toBe(false)
  })

  it('treats a reordered value list as unchanged', async () => {
    const { usecase, repository, appRuntime } = build()
    const multi = { ...PIN, values: ['node-a', 'node-b'] }
    const pinned = new AppPlacementBuilder().withApp({ ...placement.app, nodePin: multi }).build()
    repository.findPlacementBySlug.resolves(pinned)
    repository.updateBySlug.resolves(pinned.app)

    await usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withNodePin({ ...multi, values: ['node-b', 'node-a'] }).build(),
    )

    expect(appRuntime.deploy.called).toBe(false)
  })

  it('fails when the live release is not a release of this app', async () => {
    const { usecase, repository, appRuntime } = buildPinned()
    repository.findRelease.resolves(undefined)

    await expect(
      usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build()),
    ).rejects.toThrow(InternalServerErrorException)

    expect(appRuntime.deploy.called).toBe(false)
  })

  it('propagates a failed deploy so the transaction rolls the write back', async () => {
    const { usecase, appRuntime } = buildPinned()
    appRuntime.deploy.rejects(new Error('cluster unreachable'))

    await expect(
      usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build()),
    ).rejects.toThrow('cluster unreachable')
  })

  it('writes before it deploys', async () => {
    const { usecase, repository, appRuntime } = buildPinned()
    const order: string[] = []
    appRuntime.deploy.callsFake(() => {
      order.push('deploy')
      return Promise.resolve()
    })
    repository.updateBySlug.callsFake(() => {
      order.push('write')
      return Promise.resolve(pinnedApp)
    })

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

    expect(order).toEqual(['write', 'deploy'])
  })
})
