import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppSourceBuilder } from '#src/app/app-management/entities/app-source.builder.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { StartBuildRepository } from '#src/app/build-management/use-cases/start-build/start-build.repository.js'
import { StartBuildUseCase } from '#src/app/build-management/use-cases/start-build/start-build.use-case.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const source = new AppSourceBuilder().build()
const sourced = new AppBuilder().withSlug('shop').withSource(source).build()
const head = { commitSha: MOCK_COMMIT_SHA, gitToken: 'ghs_t' }

function build(app = sourced) {
  const repository = createStubInstance(StartBuildRepository)
  repository.findAppBySlug.resolves(app)
  repository.lockApp.resolves(app)
  const starter = createStubInstance(BuildStarter)
  starter.resolveHead.resolves(head)
  starter.start.resolves(new BuildBuilder().withApp(app).withCommitSha(MOCK_COMMIT_SHA).build())
  const usecase = new StartBuildUseCase(stubDatabase(), repository, starter)
  return { usecase, repository, starter }
}

describe('StartBuildUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the branch head as a manual build', async () => {
    const { usecase, starter } = build()

    const summary = await usecase.execute('shop')

    expect(starter.resolveHead.calledOnceWith(source)).toBe(true)
    expect(
      starter.start.calledOnceWith(match.any, sourced, { trigger: BuildTrigger.Manual, ...head }),
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

  it('passes a failed head lookup through, and starts nothing', async () => {
    const { usecase, starter } = build()
    starter.resolveHead.rejects(new UnprocessableEntityException("Branch 'main' was not found"))

    await expect(usecase.execute('shop')).rejects.toThrow(UnprocessableEntityException)
    expect(starter.start.called).toBe(false)
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
