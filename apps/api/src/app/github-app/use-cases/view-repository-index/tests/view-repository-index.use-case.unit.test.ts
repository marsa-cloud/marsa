import { before, describe, it } from 'node:test'
import { BadGatewayException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { InstallationCredentials } from '#src/app/github-app/queries/installation-credentials.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import { ViewRepositoryIndexUseCase } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const installation = (installationId: string): InstallationCredentials => ({
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  installationId,
  githubAppId: '42',
  privateKeyPemEnc: 'enc-pem',
})
const personal = installation('1')
const org = installation('2')

function build(installations = [personal, org]) {
  const repository = createStubInstance(ViewRepositoryIndexRepository)
  repository.findInstallations.resolves(installations)
  const github = createStubInstance(MockGithubClient)
  github.getInstallationToken.callsFake(({ installationId }) =>
    Promise.resolve(`token-${installationId}`),
  )
  github.listInstallationRepos
    .withArgs('token-1')
    .resolves([{ fullName: 'me/zeta', defaultBranch: 'main', private: false }])
  github.listInstallationRepos
    .withArgs('token-2')
    .resolves([{ fullName: 'acme/alpha', defaultBranch: 'trunk', private: true }])
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns('pem')
  const usecase = new ViewRepositoryIndexUseCase(repository, github, cipher)
  return { usecase, github }
}

describe('ViewRepositoryIndexUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('lists every installation’s repos, tagged with their installation, by name', async () => {
    const { usecase } = build()

    const response = await usecase.execute()

    expect(response.items).toEqual([
      {
        installationUuid: org.installationUuid,
        fullName: 'acme/alpha',
        defaultBranch: 'trunk',
        private: true,
      },
      {
        installationUuid: personal.installationUuid,
        fullName: 'me/zeta',
        defaultBranch: 'main',
        private: false,
      },
    ])
  })

  it('skips an installation GitHub refuses and keeps the rest', async () => {
    const { usecase, github } = build()
    github.getInstallationToken.withArgs(match({ installationId: '1' })).rejects(new Error('gone'))

    const response = await usecase.execute()

    expect(response.items.map((repo) => repo.fullName)).toEqual(['acme/alpha'])
  })

  it('502s when no installation could be listed', async () => {
    const { usecase, github } = build()
    // Replaces the callsFake default; a listInstallationRepos withArgs would outrank a default.
    github.getInstallationToken.rejects(new Error('down'))

    await expect(usecase.execute()).rejects.toThrow(BadGatewayException)
  })

  it('is empty, not an error, before any installation exists', async () => {
    const { usecase } = build([])

    expect((await usecase.execute()).items).toEqual([])
  })
})
