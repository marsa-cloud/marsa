import { before, describe, it } from 'node:test'
import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { CreateAppCommandBuilder } from '#src/app/app-management/use-cases/create-app/create-app.command.builder.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppUseCase } from '#src/app/app-management/use-cases/create-app/create-app.use-case.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MOCK_COMMIT_SHA, MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const installationUuid = generateUuid<GitHubInstallationUuid>()
const source = { installationUuid, repo: 'acme/shop', branch: 'main' }

function build() {
  const repository = createStubInstance(CreateAppRepository)
  repository.insert.resolves('inserted')
  repository.findInstallationCredentials.resolves({
    installationUuid,
    installationId: '7',
    githubAppId: '42',
    privateKeyPemEnc: 'enc-pem',
  })
  repository.insertBuild.callsFake((_tx, build) =>
    Promise.resolve(
      new BuildBuilder().withCommitSha(build.commitSha).withTrigger(build.trigger).build(),
    ),
  )
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const credentialsCipher = createStubInstance(ImagePullCredentialsCipher)
  credentialsCipher.seal.returns('sealed')
  const secretCipher = createStubInstance(SecretCipherService)
  secretCipher.decrypt.returns('pem')
  const github = createStubInstance(MockGithubClient)
  github.getInstallationToken.resolves('ghs_t')
  github.getBranchHead.resolves(MOCK_COMMIT_SHA)
  const buildRuntime = createStubInstance(MockBuildRuntime)
  buildRuntime.start.resolves()
  const usecase = new CreateAppUseCase(
    stubDatabase(),
    repository,
    credentialsCipher,
    secretCipher,
    github,
    buildRuntime,
    new MockImageRegistry(),
    config,
  )
  return { usecase, repository, credentialsCipher, github, buildRuntime }
}

describe('CreateAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  describe('from an image', () => {
    it('stores the app without touching the cluster and returns its URL', async () => {
      const { usecase, repository, buildRuntime } = build()

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
      expect(buildRuntime.start.called).toBe(false)
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

    it('rejects an unknown environment with 404', async () => {
      const { usecase, repository } = build()
      repository.insert.resolves('environment-missing')

      await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('from a GitHub repo', () => {
    it('stores the app without an image and builds the branch head', async () => {
      const { usecase, repository, github, buildRuntime } = build()

      await usecase.execute(new CreateAppCommandBuilder().fromSource(source).build())

      expect(
        github.getBranchHead.calledOnceWith({ token: 'ghs_t', repo: 'acme/shop', branch: 'main' }),
      ).toBe(true)
      expect(repository.insert.firstCall.args[1]).toMatchObject({
        image: null,
        containerPort: 8080,
        source: {
          type: 'github',
          installationUuid,
          repo: 'acme/shop',
          branch: 'main',
          rootDir: '.',
          dockerfilePath: 'Dockerfile',
        },
      })
      expect(
        repository.insertBuild.calledOnceWith(
          match.any,
          match({ commitSha: MOCK_COMMIT_SHA, branch: 'main', trigger: BuildTrigger.Create }),
        ),
      ).toBe(true)
      expect(buildRuntime.start.firstCall.args[1]).toMatchObject({
        repoUrl: 'https://github.com/acme/shop.git',
        commitSha: MOCK_COMMIT_SHA,
        gitToken: 'ghs_t',
        pushRef: `registry.mock.test/my-app:${MOCK_COMMIT_SHA}`,
      })
    })

    it('422s before writing anything when the branch cannot be read', async () => {
      const { usecase, repository, github } = build()
      github.getBranchHead.rejects(new Error("Branch 'main' of 'acme/shop' was not found"))

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(repository.insert.called).toBe(false)
    })

    it('422s an installation Marsa does not know', async () => {
      const { usecase, repository } = build()
      repository.findInstallationCredentials.resolves(undefined)

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('502s when GitHub will not mint a token', async () => {
      const { usecase, github } = build()
      github.getInstallationToken.rejects(
        new Error('Could not mint a GitHub installation access token.'),
      )

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(BadGatewayException)
    })

    it('keeps the app and records a failed build when the runtime refuses the build', async () => {
      const { usecase, repository, buildRuntime } = build()
      buildRuntime.start.rejects(new Error('jobs is forbidden'))

      const result = await usecase.execute(new CreateAppCommandBuilder().fromSource(source).build())

      expect(result.slug).toBe('my-app')
      expect(repository.failBuild.calledOnceWith(match.any, match.any, 'jobs is forbidden')).toBe(
        true,
      )
    })
  })
})
