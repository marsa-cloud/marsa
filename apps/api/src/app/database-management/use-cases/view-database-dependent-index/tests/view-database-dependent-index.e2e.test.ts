import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { type DatabaseRow } from '#src/app/database-management/entities/database.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const DB_SLUG = 'dependents-db'
const LONELY_DB_SLUG = 'dependents-lonely-db'

describe('GET /api/v1/databases/:slug/dependents (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let database: DatabaseRow
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment

    database = await setup.seedDatabase(environment.uuid, DB_SLUG)
    await setup.seedDatabase(environment.uuid, LONELY_DB_SLUG)

    for (const slug of ['dependents-worker', 'dependents-api']) {
      const app = await setup.seedApp(environment.uuid, slug)
      await setup.seedAttachment(app.uuid, database.uuid)
    }
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists the dependent apps sorted by slug', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/databases/${DB_SLUG}/dependents`)
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toEqual(['dependents-api', 'dependents-worker'])
  })

  it('answers with an empty list when nothing uses it', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/databases/${LONELY_DB_SLUG}/dependents`)
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toEqual([])
  })

  it('rejects an unknown database with 404', async () => {
    await request(setup.httpServer)
      .get('/api/v1/databases/ghost-db/dependents')
      .set('Cookie', cookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/databases/${DB_SLUG}/dependents`).expect(401)
  })
})
