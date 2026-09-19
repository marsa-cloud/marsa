import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { UpdateAppCommandBuilder } from '#src/app/app-management/use-cases/update-app/update-app.command.builder.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppUseCase } from '#src/app/app-management/use-cases/update-app/update-app.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const stored = () =>
  new AppBuilder()
    .withImage('nginx:1.27')
    .withMinReplicas(0)
    .withMaxReplicas(2)
    .withEnv({ A: '1' })
    .withImagePullCredentialsEnc('old-sealed')
    .build()

function build(app: App = stored()) {
  const repository = createStubInstance(UpdateAppRepository)
  repository.findBySlug.resolves(app)
  repository.update.callsFake((_uuid, patch) => Promise.resolve({ ...app, ...patch }))
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.seal.returns('new-sealed')
  return { usecase: new UpdateAppUseCase(repository, cipher), repository, cipher }
}

describe('UpdateAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('keeps every field the command omits', async () => {
    const { usecase, repository } = build()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withImage('nginx:1.28').build())

    expect(repository.update.firstCall.args[1]).toEqual({
      image: 'nginx:1.28',
      containerPort: 80,
      minReplicas: 0,
      maxReplicas: 2,
      env: { A: '1' },
      imagePullCredentialsEnc: 'old-sealed',
    })
  })

  it('lifts the stored ceiling when a new floor exceeds it', async () => {
    const { usecase, repository } = build()

    await usecase.execute('my-app', new UpdateAppCommandBuilder().withMinReplicas(5).build())

    expect(repository.update.firstCall.args[1]).toMatchObject({ minReplicas: 5, maxReplicas: 5 })
  })

  it('clears credentials on null and seals replacements', async () => {
    const cleared = build()
    await cleared.usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withImagePullCredentials(null).build(),
    )
    expect(cleared.repository.update.firstCall.args[1].imagePullCredentialsEnc).toBeNull()

    const replaced = build()
    const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }
    await replaced.usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withImagePullCredentials(credentials).build(),
    )
    expect(replaced.cipher.seal.calledOnceWithExactly(credentials)).toBe(true)
    expect(replaced.repository.update.firstCall.args[1].imagePullCredentialsEnc).toBe('new-sealed')
  })

  it('returns the stored config without the sealed credentials', async () => {
    const { usecase } = build()

    const result = await usecase.execute(
      'my-app',
      new UpdateAppCommandBuilder().withEnv({}).build(),
    )

    expect(result).toEqual({
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
      minReplicas: 0,
      maxReplicas: 2,
      env: {},
    })
  })

  it('throws NotFound for an unknown slug', async () => {
    const { usecase, repository } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', new UpdateAppCommandBuilder().build())).rejects.toThrow(
      NotFoundException,
    )
    expect(repository.update.called).toBe(false)
  })
})
