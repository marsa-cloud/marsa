import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { DatabaseBuilder } from '#src/app/database-management/entities/database.builder.js'
import {
  type DatabaseRow,
  databaseTable,
} from '#src/app/database-management/entities/database.table.js'
import { DatabaseAttachmentBuilder } from '#src/app/database-management/entities/database-attachment.builder.js'
import { databaseAttachmentTable } from '#src/app/database-management/entities/database-attachment.table.js'
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

    database = new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug(DB_SLUG).build()
    await setup.db.insert(databaseTable).values(database)
    await setup.db
      .insert(databaseTable)
      .values(
        new DatabaseBuilder()
          .withEnvironmentUuid(environment.uuid)
          .withSlug(LONELY_DB_SLUG)
          .build(),
      )

    for (const slug of ['dependents-worker', 'dependents-api']) {
      const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build()
      await setup.db.insert(appTable).values(app)
      await setup.db
        .insert(databaseAttachmentTable)
        .values(new DatabaseAttachmentBuilder().withApp(app).withDatabase(database).build())
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
