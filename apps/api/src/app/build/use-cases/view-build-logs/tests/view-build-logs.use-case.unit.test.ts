import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { ViewBuildLogsRepository } from '#src/app/build/use-cases/view-build-logs/view-build-logs.repository.js'
import {
  BUILD_LOGS_EXPIRED,
  ViewBuildLogsUseCase,
} from '#src/app/build/use-cases/view-build-logs/view-build-logs.use-case.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const build = new BuildBuilder().build()

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
    expect(runtime.readLogs.firstCall.args[0]).toEqual({
      build: { uuid: build.uuid },
      app: { slug: 'shop' },
    })
  })

  it('404s a build that is not the app', async () => {
    const { usecase, repository } = setup()
    repository.findBuild.resolves(undefined)

    await expect(usecase.execute('shop', build.uuid)).rejects.toThrow(
      `Build '${build.uuid}' was not found for app 'shop'.`,
    )
  })

  it('404s once the runtime no longer keeps the logs', async () => {
    const { usecase, runtime } = setup()
    runtime.readLogs.resolves(null)

    const pending = usecase.execute('shop', build.uuid)

    await expect(pending).rejects.toThrow(NotFoundException)
    await expect(pending).rejects.toThrow(BUILD_LOGS_EXPIRED)
  })
})
