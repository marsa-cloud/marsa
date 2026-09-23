import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { CreateAppCommandBuilder } from '#src/app/app-management/use-cases/create-app/create-app.command.builder.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppUseCase } from '#src/app/app-management/use-cases/create-app/create-app.use-case.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().build()
const environment = new EnvironmentBuilder().withProject(project).build()

function build() {
  const repository = createStubInstance(CreateAppRepository)
  repository.lockEnvironment.resolves({ environment, project })
  repository.isNameTaken.resolves(false)
  repository.insert.resolves('inserted')
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.seal.returns('sealed')
  return {
    usecase: new CreateAppUseCase(stubDatabase(), repository, cipher, config),
    repository,
    cipher,
  }
}

describe('CreateAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the app without touching the cluster and returns its URL', async () => {
    const { usecase, repository } = build()

    const command = new CreateAppCommandBuilder().withEnv({ A: '1' }).build()
    const result = await usecase.execute(command)

    expect(result).toEqual({ slug: 'my-app', url: 'https://my-app.demo.marsa.cc' })
    const app = repository.insert.firstCall.args[1]
    expect(app).toMatchObject({
      environmentUuid: command.environmentUuid,
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
      minReplicas: 1,
      maxReplicas: 1,
      env: { A: '1' },
      imagePullCredentialsEnc: null,
    })
  })

  it('lifts a default ceiling to a floor above it', async () => {
    const { usecase, repository } = build()

    await usecase.execute(new CreateAppCommandBuilder().withMinReplicas(3).build())

    expect(repository.insert.firstCall.args[1]).toMatchObject({ minReplicas: 3, maxReplicas: 3 })
  })

  it('seals pull credentials', async () => {
    const { usecase, repository, cipher } = build()
    const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }

    await usecase.execute(
      new CreateAppCommandBuilder().withImagePullCredentials(credentials).build(),
    )

    expect(cipher.seal.calledOnceWithExactly(credentials)).toBe(true)
    expect(repository.insert.firstCall.args[1].imagePullCredentialsEnc).toBe('sealed')
  })

  it('rejects a taken slug with 409', async () => {
    const { usecase, repository } = build()
    repository.insert.resolves('slug-taken')

    await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
      ConflictException,
    )
  })

  it('rejects a name a database in the environment already uses with 409', async () => {
    const { usecase, repository } = build()
    repository.isNameTaken.resolves(true)

    await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
      ConflictException,
    )

    expect(repository.insert.called).toBe(false)
  })

  it('rejects an unknown environment with 404', async () => {
    const { usecase, repository } = build()
    repository.lockEnvironment.resolves(undefined)

    await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
      NotFoundException,
    )
  })
})
