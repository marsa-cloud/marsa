import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { ViewAppIndexQueryBuilder } from '#src/app/app-management/use-cases/view-app-index/query/view-app-index.query.builder.js'
import type { ViewAppIndexQueryKey } from '#src/app/app-management/use-cases/view-app-index/query/view-app-index.query.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SEEDED = 7
const PAGE_SIZE = 3

// The keyset contract itself, proven once over one endpoint rather than per endpoint.
describe('keyset pagination (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment

    await setup.db
      .insert(appTable)
      .values(
        Array.from({ length: SEEDED }, (_unused, index) =>
          new AppBuilder()
            .withEnvironmentUuid(environment.uuid)
            .withSlug(`page-app-${index}`)
            .build(),
        ),
      )
  })

  after(() => setup.teardown())

  async function page(cursor?: ViewAppIndexQueryKey) {
    const builder = new ViewAppIndexQueryBuilder().withLimit(PAGE_SIZE)
    if (cursor) builder.withKey(cursor)
    return request(setup.httpServer)
      .get('/api/v1/apps')
      .query(builder.build())
      .set('Cookie', sessionCookie)
      .expect(200)
  }

  it('walks every row exactly once and stops on a short page', async () => {
    const seen: string[] = []
    let next: ViewAppIndexQueryKey | null = null
    let requests = 0

    do {
      const response = await page(next ?? undefined)
      requests++
      seen.push(...response.body.items.map((app: { slug: string }) => app.slug))

      expect(response.body.items.length).toBeLessThanOrEqual(PAGE_SIZE)
      // A page-boundary off-by-one shows up here first: building `next` from an
      // over-fetched row rather than the last one returned skips or repeats.
      expect(new Set(seen).size).toBe(seen.length)
      expect(requests).toBeLessThan(10)

      next = response.body.items.length === PAGE_SIZE ? response.body.meta.next : null
    } while (next !== null)

    expect(seen).toHaveLength(SEEDED)
    expect(requests).toBe(Math.ceil(SEEDED / PAGE_SIZE))
  })
})
