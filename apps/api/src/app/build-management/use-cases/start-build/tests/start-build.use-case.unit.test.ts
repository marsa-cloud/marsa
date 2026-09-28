import { before, describe, it } from 'node:test'
import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { StartBuildRepository } from '#src/app/build-management/use-cases/start-build/start-build.repository.js'
import { StartBuildUseCase } from '#src/app/build-management/use-cases/start-build/start-build.use-case.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { BranchNotFoundError } from '#src/modules/github-client/github-client.errors.js'
import { MOCK_COMMIT_SHA, MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const source: AppSource = {
  type: 'github',
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  repo: 'acme/shop',
  branch: 'main',
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
}
const sourced = new AppBuilder().withSlug('shop').withSource(source).build()

function build(app = sourced) {
  const repository = createStubInstance(StartBuildRepository)
  repository.findAppBySlug.resolves(app)
  repository.lockApp.resolves(app)
  const starter = createStubInstance(BuildStarter)
  starter.mintToken.resolves('ghs_t')
  starter.start.resolves(new BuildBuilder().withApp(app).withCommitSha(MOCK_COMMIT_SHA).build())
  const github = createStubInstance(MockGithubClient)
  github.getBranchHead.resolves(MOCK_COMMIT_SHA)
  const usecase = new StartBuildUseCase(stubDatabase(), repository, starter, github)
  return { usecase, repository, starter, github }
}

describe('StartBuildUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the branch head as a manual build', async () => {
    const { usecase, starter, github } = build()

    const summary = await usecase.execute('shop')

    expect(
      github.getBranchHead.calledOnceWith({ token: 'ghs_t', repo: 'acme/shop', branch: 'main' }),
    ).toBe(true)
    expect(
      starter.start.calledOnceWith(match.any, sourced, {
        trigger: BuildTrigger.Manual,
        commitSha: MOCK_COMMIT_SHA,
        gitToken: 'ghs_t',
      }),
    ).toBe(true)
    expect(summary.commitSha).toBe(MOCK_COMMIT_SHA)
  })

  it('404s an unknown app', async () => {
    const { usecase, repository } = build()
    repository.findAppBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('409s an app that deploys a prebuilt image', async () => {
    const { usecase } = build(new AppBuilder().withSlug('img').build())

    await expect(usecase.execute('img')).rejects.toThrow(ConflictException)
  })

  it('502s when no installation token can be minted, with the reason', async () => {
    const { usecase, starter } = build()
    starter.mintToken.rejects(new Error('Could not mint a GitHub installation access token.'))

    await expect(usecase.execute('shop')).rejects.toThrow(BadGatewayException)
  })

  it('422s when the branch cannot be resolved, and starts nothing', async () => {
    const { usecase, github, starter } = build()
    github.getBranchHead.rejects(
      new BranchNotFoundError("Branch 'main' of 'acme/shop' was not found"),
    )

    await expect(usecase.execute('shop')).rejects.toThrow(UnprocessableEntityException)
    expect(starter.start.called).toBe(false)
  })

  it('502s when GitHub itself fails to answer the branch lookup', async () => {
    const { usecase, github } = build()
    github.getBranchHead.rejects(new Error("Could not read 'acme/shop' from GitHub."))

    await expect(usecase.execute('shop')).rejects.toThrow(BadGatewayException)
  })

  it('409s when the app switched branches while the build was starting', async () => {
    const { usecase, repository, starter } = build()
    repository.lockApp.resolves({
      ...sourced,
      source: { ...source, branch: 'release' },
    })

    await expect(usecase.execute('shop')).rejects.toThrow(ConflictException)
    expect(starter.start.called).toBe(false)
  })
})
