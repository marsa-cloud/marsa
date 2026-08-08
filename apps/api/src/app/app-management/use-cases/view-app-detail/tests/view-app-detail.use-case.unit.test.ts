import { before, describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ViewAppDetailRepository } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.js'
import { ViewAppDetailUseCase } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(ViewAppDetailRepository)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const usecase = new ViewAppDetailUseCase(repository, config)
  return { repository, usecase }
}

describe('ViewAppDetailUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the public URL from the slug and the configured base domain', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(
      new AppBuilder().withSlug('my-app').withEnv({ LOG_LEVEL: 'info' }).build(),
    )

    const response = await usecase.execute('my-app')

    expect(response.url).toBe('https://my-app.demo.marsa.cc')
    expect(response.env).toEqual({ LOG_LEVEL: 'info' })
  })

  it('throws 404 for an unknown slug', async () => {
    const { repository, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })
})
