import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { UpdateAppCommandBuilder } from '#src/app/app-management/use-cases/update-app/update-app.command.builder.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppUseCase } from '#src/app/app-management/use-cases/update-app/update-app.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const saved = new AppBuilder().withImage('nginx:1.28').withEnv({ A: '1' }).build()

function build() {
  const repository = createStubInstance(UpdateAppRepository)
  repository.updateBySlug.resolves(saved)
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.seal.returns('new-sealed')
  return { usecase: new UpdateAppUseCase(repository, cipher), repository, cipher }
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
    })
  })

  it('throws NotFound when no app has the slug', async () => {
    const { usecase, repository } = build()
    repository.updateBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', new UpdateAppCommandBuilder().build())).rejects.toThrow(
      NotFoundException,
    )
  })
})
