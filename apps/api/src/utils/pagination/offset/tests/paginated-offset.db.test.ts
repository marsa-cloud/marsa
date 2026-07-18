import { after, before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { expect } from 'expect'
import { DeploymentsModule } from '#src/app/deployments/deployments.module.js'
import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'
import { PaginatedOffsetResponseMeta } from '#src/utils/pagination/offset/paginated-offset-response-meta.js'

// Query params arrive as strings; mirror the global ValidationPipe's transform.
const transform = (plain: object): PaginatedOffsetQuery =>
  plainToInstance(PaginatedOffsetQuery, plain, { enableImplicitConversion: false })

describe('offset pagination over a real App query (db)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupModuleTest(DeploymentsModule)
    for (let i = 0; i < 5; i++) {
      setup.entityManager.persist(new AppBuilder().withSlug(`app-${i}`).build())
    }
    await setup.entityManager.flush()
  })

  after(async () => {
    await setup.teardown()
  })

  // Drives the real query from a PaginatedOffsetQuery (as an adopting repository
  // will) rather than hardcoded literals, so the DTO's own values are what reach
  // the database and what the meta reports back.
  it('slices the middle page from a query DTO and reports it in the meta', async () => {
    const query = transform({ limit: '2', offset: '2' })

    const [rows, total] = await setup.entityManager.findAndCount(
      App,
      {},
      { limit: query.limit, offset: query.offset, orderBy: { slug: 'ASC' } },
    )
    const meta = new PaginatedOffsetResponseMeta(total, query.offset, query.limit)

    expect(rows.map((a) => a.slug)).toEqual(['app-2', 'app-3'])
    expect(meta.total).toBe(5)
    expect(meta.offset).toBe(2)
    expect(meta.limit).toBe(2)
  })

  it('walks every row exactly once across successive pages', async () => {
    const seen: string[] = []

    for (let offset = 0; offset < 5; offset += 2) {
      const query = transform({ limit: '2', offset: String(offset) })
      const [rows, total] = await setup.entityManager.findAndCount(
        App,
        {},
        { limit: query.limit, offset: query.offset, orderBy: { slug: 'ASC' } },
      )
      expect(new PaginatedOffsetResponseMeta(total, query.offset, query.limit).total).toBe(5)
      seen.push(...rows.map((a) => a.slug))
    }

    expect(seen).toEqual(['app-0', 'app-1', 'app-2', 'app-3', 'app-4'])
  })

  it('returns an empty page past the end without inventing rows', async () => {
    const query = transform({ limit: '2', offset: '10' })

    const [rows, total] = await setup.entityManager.findAndCount(
      App,
      {},
      { limit: query.limit, offset: query.offset, orderBy: { slug: 'ASC' } },
    )
    const meta = new PaginatedOffsetResponseMeta(total, query.offset, query.limit)

    expect(rows).toEqual([])
    expect(meta.total).toBe(5)
  })
})
