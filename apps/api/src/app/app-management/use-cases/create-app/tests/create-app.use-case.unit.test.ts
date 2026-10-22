import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppSourceBuilder } from '#src/app/app-management/entities/app-source.builder.js'
import { CreateAppCommandBuilder } from '#src/app/app-management/use-cases/create-app/create-app.command.builder.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppUseCase } from '#src/app/app-management/use-cases/create-app/create-app.use-case.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const installationUuid = generateUuid<GitHubInstallationUuid>()
const source = { installationUuid, repo: 'acme/shop', branch: 'main' }

const project = new ProjectBuilder().build()
const environment = new EnvironmentBuilder().withProjectUuid(project.uuid).build()

const head = { commitSha: MOCK_COMMIT_SHA, gitToken: 'ghs_t' }

function build() {
  const repository = createStubInstance(CreateAppRepository)
  repository.findEnvironmentForUpdate.resolves({ environment, project })
  repository.isNameTaken.resolves(false)
  repository.insert.resolves('inserted')
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const credentialsCipher = createStubInstance(ImagePullCredentialsCipher)
  credentialsCipher.seal.returns('sealed')
  const starter = createStubInstance(BuildStarter)
  starter.resolveHead.resolves(head)
  starter.start.resolves(new BuildBuilder().build())
  const usecase = new CreateAppUseCase(
    stubDatabase(),
    repository,
    credentialsCipher,
    starter,
    config,
  )
  return { usecase, repository, credentialsCipher, starter }
}

describe('CreateAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  describe('from an image', () => {
    it('stores the app without touching the cluster and returns its URL', async () => {
      const { usecase, repository, starter } = build()

      const command = new CreateAppCommandBuilder().withEnv({ A: '1' }).build()
      const result = await usecase.execute(command)

      expect(result).toEqual({ slug: 'my-app', url: 'https://my-app.demo.marsa.cc' })
      expect(repository.insert.firstCall.args[1]).toMatchObject({
        environmentUuid: command.environmentUuid,
        slug: 'my-app',
        image: 'nginx:1.27',
        containerPort: 80,
        minReplicas: 1,
        maxReplicas: 1,
        env: { A: '1' },
        source: null,
        imagePullCredentialsEnc: null,
      })
      expect(starter.resolveHead.called).toBe(false)
      expect(starter.start.called).toBe(false)
    })

    it('lifts a default ceiling to a floor above it', async () => {
      const { usecase, repository } = build()

      await usecase.execute(new CreateAppCommandBuilder().withMinReplicas(3).build())

      expect(repository.insert.firstCall.args[1]).toMatchObject({ minReplicas: 3, maxReplicas: 3 })
    })

    it('seals pull credentials', async () => {
      const { usecase, repository, credentialsCipher } = build()
      const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }

      await usecase.execute(
        new CreateAppCommandBuilder().withImagePullCredentials(credentials).build(),
      )

      expect(credentialsCipher.seal.calledOnceWithExactly(credentials)).toBe(true)
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
      repository.findEnvironmentForUpdate.resolves(undefined)

      await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('from a GitHub repo', () => {
    it('stores the app without an image and starts a create build of the branch head', async () => {
      const { usecase, repository, starter } = build()

      await usecase.execute(new CreateAppCommandBuilder().fromSource(source).build())

      const expectedSource = new AppSourceBuilder().withInstallationUuid(installationUuid).build()
      expect(starter.resolveHead.calledOnceWith(expectedSource)).toBe(true)
      const app = repository.insert.firstCall.args[1]
      expect(app).toMatchObject({ image: null, containerPort: 8080, source: expectedSource })
      expect(
        starter.start.calledOnceWith(match.any, app, { trigger: BuildTrigger.Create, ...head }),
      ).toBe(true)
    })

    it('fails before writing anything when the head cannot be resolved', async () => {
      const { usecase, repository, starter } = build()
      starter.resolveHead.rejects(new UnprocessableEntityException("Branch 'main' was not found"))

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(repository.insert.called).toBe(false)
      expect(starter.start.called).toBe(false)
    })

    it('does not start a build when the slug is taken', async () => {
      const { usecase, repository, starter } = build()
      repository.insert.resolves('slug-taken')

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(ConflictException)
      expect(starter.start.called).toBe(false)
    })
  })
})
