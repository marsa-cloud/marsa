import { before, describe, it } from 'node:test'
import { BadGatewayException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { InstallationCredentials } from '#src/app/github-app/queries/installation-credentials.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import { ViewRepositoryIndexUseCase } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const installation: InstallationCredentials = {
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  installationId: '1',
  githubAppId: '42',
  privateKeyPemEnc: 'enc-pem',
}

function build(hasInstallation = true) {
  const repository = createStubInstance(ViewRepositoryIndexRepository)
  repository.findInstallation.resolves(hasInstallation ? installation : undefined)
  const github = createStubInstance(MockGithubClient)
  github.getInstallationToken.resolves('token-1')
  github.listInstallationRepos.withArgs('token-1').resolves([
    { fullName: 'me/zeta', defaultBranch: 'main', private: false },
    { fullName: 'acme/alpha', defaultBranch: 'trunk', private: true },
  ])
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns('pem')
  const usecase = new ViewRepositoryIndexUseCase(repository, github, cipher)
  return { usecase, github }
}

describe('ViewRepositoryIndexUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('lists the installation’s repos, tagged with it, by name', async () => {
    const { usecase } = build()

    const response = await usecase.execute()

    expect(response.items).toEqual([
      {
        installationUuid: installation.installationUuid,
        fullName: 'acme/alpha',
        defaultBranch: 'trunk',
        private: true,
      },
      {
        installationUuid: installation.installationUuid,
        fullName: 'me/zeta',
        defaultBranch: 'main',
        private: false,
      },
    ])
  })

  it('502s when GitHub refuses the installation', async () => {
    const { usecase, github } = build()
    github.getInstallationToken.rejects(new Error('gone'))

    await expect(usecase.execute()).rejects.toThrow(BadGatewayException)
  })

  it('502s when GitHub fails to list the repos', async () => {
    const { usecase, github } = build()
    github.listInstallationRepos.withArgs('token-1').rejects(new Error('down'))

    await expect(usecase.execute()).rejects.toThrow(BadGatewayException)
  })

  it('is empty, not an error, before any installation exists', async () => {
    const { usecase } = build(false)

    expect((await usecase.execute()).items).toEqual([])
  })
})
