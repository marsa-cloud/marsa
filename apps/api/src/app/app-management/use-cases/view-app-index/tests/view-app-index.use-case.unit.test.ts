import { before, describe, it } from 'node:test'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import {
  ViewAppIndexPaginationQuery,
  ViewAppIndexQuery,
  ViewAppIndexQueryKey,
} from '#src/app/app-management/use-cases/view-app-index/query/view-app-index.query.js'
import { ViewAppIndexRepository } from '#src/app/app-management/use-cases/view-app-index/view-app-index.repository.js'
import { ViewAppIndexUseCase } from '#src/app/app-management/use-cases/view-app-index/view-app-index.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { DEFAULT_PAGINATION_MAX_LIMIT } from '#src/utils/pagination/pagination-mapper.js'

const BASE_DOMAIN = 'demo.marsa.cc'

function build(apps: App[]) {
  const repository = createStubInstance(ViewAppIndexRepository)
  repository.listApps.resolves(apps)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns(BASE_DOMAIN)
  const usecase = new ViewAppIndexUseCase(repository, config)
  return { usecase, repository }
}

function query(limit?: number, key?: ViewAppIndexQueryKey): ViewAppIndexQuery {
  const request = new ViewAppIndexQuery()
  if (limit === undefined && key === undefined) {
    return request
  }
  request.pagination = new ViewAppIndexPaginationQuery()
  request.pagination.limit = limit
  request.pagination.key = key
  return request
}

describe('ViewAppIndexUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('maps each app to a summary with slug, image and public URL', async () => {
    const app = new AppBuilder().withSlug('alpha').withImage('nginx:1.27').build()
    const { usecase } = build([app])

    const result = await usecase.execute(query())

    expect(result.items).toHaveLength(1)
    expect(result.items[0].slug).toBe('alpha')
    expect(result.items[0].image).toBe('nginx:1.27')
    expect(result.items[0].url).toBe('https://alpha.demo.marsa.cc')
  })

  it('preserves repository ordering across multiple apps', async () => {
    const newest = new AppBuilder().withSlug('newest').build()
    const older = new AppBuilder().withSlug('older').build()
    const { usecase } = build([newest, older])

    const result = await usecase.execute(query())

    expect(result.items.map((a) => a.slug)).toEqual(['newest', 'older'])
  })

  it('returns an empty list when no apps are deployed', async () => {
    const { usecase } = build([])

    const result = await usecase.execute(query())

    expect(result.items).toEqual([])
  })

  it('builds the next key from the last app returned', async () => {
    const first = new AppBuilder().withSlug('first').build()
    const last = new AppBuilder().withSlug('last').build()
    const { usecase } = build([first, last])

    const result = await usecase.execute(query())

    expect(result.meta.next).toEqual({ uuid: last.uuid })
  })

  it('reports no next key once a page comes back empty', async () => {
    const { usecase } = build([])

    const result = await usecase.execute(query())

    expect(result.meta.next).toBeNull()
  })

  it('seeks past the supplied cursor', async () => {
    const cursor = new AppBuilder().build()
    const { usecase, repository } = build([])

    await usecase.execute(query(10, ViewAppIndexQueryKey.from(cursor)))

    expect(repository.listApps.firstCall.args).toEqual([10, cursor.uuid])
  })

  it('falls back to the maximum page size when no limit is given', async () => {
    const { usecase, repository } = build([])

    await usecase.execute(query())

    expect(repository.listApps.firstCall.args[0]).toBe(DEFAULT_PAGINATION_MAX_LIMIT)
  })

  it('clamps a page size above the ceiling', async () => {
    const { usecase, repository } = build([])

    await usecase.execute(query(5000))

    expect(repository.listApps.firstCall.args[0]).toBe(DEFAULT_PAGINATION_MAX_LIMIT)
  })
})
