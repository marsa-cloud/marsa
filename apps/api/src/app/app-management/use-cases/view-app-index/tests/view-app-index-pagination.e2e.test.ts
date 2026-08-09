import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SEEDED = 7
const PAGE_SIZE = 3

describe('GET /api/v1/apps pagination (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()

    // Inserted one at a time: uuidv7 encodes the clock, and the seek orders by
    // it, so the rows need distinguishable creation instants.
    for (let index = 0; index < SEEDED; index++) {
      await setup.db.insert(appTable).values(new AppBuilder().withSlug(`page-app-${index}`).build())
    }
  })

  after(() => setup.teardown())

  async function page(key?: { uuid: string }) {
    const query: Record<string, unknown> = { pagination: { limit: PAGE_SIZE, ...(key && { key }) } }
    return request(setup.httpServer)
      .get('/api/v1/apps')
      .query(query)
      .set('Cookie', sessionCookie)
      .expect(200)
  }

  it('walks every row exactly once and stops on an empty page', async () => {
    const seen: string[] = []
    let next: { uuid: string } | null = null
    let requests = 0

    do {
      const response = await page(next ?? undefined)
      requests++
      seen.push(...response.body.items.map((app: { slug: string }) => app.slug))
      next = response.body.items.length > 0 ? response.body.meta.next : null

      expect(response.body.items.length).toBeLessThanOrEqual(PAGE_SIZE)
      // A page-boundary off-by-one shows up here first: building `next` from an
      // over-fetched row rather than the last one returned skips or repeats.
      expect(new Set(seen).size).toBe(seen.length)
      expect(requests).toBeLessThan(10)
    } while (next !== null)

    expect(seen).toHaveLength(SEEDED)
    expect(requests).toBe(Math.ceil(SEEDED / PAGE_SIZE) + 1)
  })

  it('caps the page size at the configured ceiling', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/apps')
      .query({ pagination: { limit: 5000 } })
      .set('Cookie', sessionCookie)
      .expect(400)

    expect(response.body.message.join(' ')).toMatch(/limit/)
  })

  it('rejects a cursor that is not a uuid', async () => {
    await request(setup.httpServer)
      .get('/api/v1/apps')
      .query({ pagination: { key: { uuid: 'not-a-uuid' } } })
      .set('Cookie', sessionCookie)
      .expect(400)
  })
})
