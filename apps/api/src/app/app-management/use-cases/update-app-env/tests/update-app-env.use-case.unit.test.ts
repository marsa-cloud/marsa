import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { UpdateAppEnvCommandBuilder } from '#src/app/app-management/use-cases/update-app-env/update-app-env.command.builder.js'
import { UpdateAppEnvRepository } from '#src/app/app-management/use-cases/update-app-env/update-app-env.repository.js'
import { UpdateAppEnvUseCase } from '#src/app/app-management/use-cases/update-app-env/update-app-env.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(UpdateAppEnvRepository)
  const usecase = new UpdateAppEnvUseCase(repository)
  return { repository, usecase }
}

describe('UpdateAppEnvUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('writes the command env against the resolved app and reports the drift', async () => {
    const app = new AppBuilder().withSlug('my-app').withEnv({ OLD: 'value' }).build()
    const { repository, usecase } = build()
    repository.findBySlug.resolves(app)
    repository.updateEnv.resolves(
      new AppBuilder().withSlug('my-app').withEnv({ LOG_LEVEL: 'debug' }).build(),
    )

    const response = await usecase.execute(
      'my-app',
      new UpdateAppEnvCommandBuilder().withEnv({ LOG_LEVEL: 'debug' }).build(),
    )

    expect(repository.updateEnv.calledOnceWith(app.uuid, { LOG_LEVEL: 'debug' })).toBe(true)
    expect(response.env).toEqual({ LOG_LEVEL: 'debug' })
    expect(response.redeployRequired).toBe(true)
  })

  it('throws 404 when the app is deleted between the lookup and the write', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(new AppBuilder().withSlug('my-app').build())
    repository.updateEnv.resolves(undefined)

    await expect(
      usecase.execute('my-app', new UpdateAppEnvCommandBuilder().build()),
    ).rejects.toThrow(NotFoundException)
  })

  it('throws 404 for an unknown slug and writes nothing', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(
      usecase.execute('ghost', new UpdateAppEnvCommandBuilder().build()),
    ).rejects.toThrow(NotFoundException)

    expect(repository.updateEnv.called).toBe(false)
  })
})
