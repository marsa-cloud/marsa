import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import { DeploymentsModule } from '#src/app/deployments/deployments.module.js'
import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { PaginatedOffsetResponseMeta } from '#src/utils/pagination/offset/paginated-offset-response-meta.js'

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

  it('slices the middle page and the meta matches findAndCount', async () => {
    const [rows, total] = await setup.entityManager.findAndCount(
      App,
      {},
      { limit: 2, offset: 2, orderBy: { slug: 'ASC' } },
    )
    const meta = new PaginatedOffsetResponseMeta(total, 2, 2)

    expect(total).toBe(5)
    expect(rows.map((a) => a.slug)).toEqual(['app-2', 'app-3'])
    expect(meta.total).toBe(5)
    expect(meta.offset).toBe(2)
    expect(meta.limit).toBe(2)
  })
})
