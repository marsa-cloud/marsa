import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { BuildLogsExpiredError } from '#src/app/build-management/errors/build-logs-expired.error.js'
import { ViewBuildLogsRepository } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.repository.js'
import { ViewBuildLogsUseCase } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.use-case.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const build = new BuildBuilder().build()
const finished = new BuildBuilder().withStatus(BuildStatus.Succeeded).build()

function setup() {
  const repository = createStubInstance(ViewBuildLogsRepository)
  repository.findBuild.resolves(build)
  const runtime = createStubInstance(MockBuildRuntime)
  runtime.readLogs.resolves('#1 DONE')
  return { usecase: new ViewBuildLogsUseCase(repository, runtime), repository, runtime }
}

describe('ViewBuildLogsUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('returns the runtime log of a build of that app', async () => {
    const { usecase, runtime } = setup()

    const response = await usecase.execute('shop', build.uuid)

    expect(response.logs).toBe('#1 DONE')
    expect(runtime.readLogs.firstCall.args).toEqual([
      { build: { uuid: build.uuid }, app: { slug: 'shop' } },
      { tailLines: 1000 },
    ])
  })

  it('passes the requested tail through to the runtime', async () => {
    const { usecase, runtime } = setup()

    await usecase.execute('shop', build.uuid, 20)

    expect(runtime.readLogs.firstCall.args[1]).toEqual({ tailLines: 20 })
  })

  it('returns empty logs for a running build whose pod has not started yet', async () => {
    const { usecase, runtime } = setup()
    runtime.readLogs.resolves(null)

    const response = await usecase.execute('shop', build.uuid)

    expect(response.logs).toBe('')
  })

  it('404s a build that is not the app', async () => {
    const { usecase, repository } = setup()
    repository.findBuild.resolves(undefined)

    await expect(usecase.execute('shop', build.uuid)).rejects.toThrow(
      `Build '${build.uuid}' was not found for app 'shop'.`,
    )
  })

  it('404s a finished build once the runtime no longer keeps its logs', async () => {
    const { usecase, repository, runtime } = setup()
    repository.findBuild.resolves(finished)
    runtime.readLogs.resolves(null)

    await expect(usecase.execute('shop', finished.uuid)).rejects.toThrow(BuildLogsExpiredError)
  })
})
