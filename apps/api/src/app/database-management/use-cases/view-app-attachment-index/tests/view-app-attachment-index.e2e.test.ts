import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
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

const APP_SLUG = 'attachment-index-app'
const DB_SLUG = 'attachment-index-db'

describe('GET /api/v1/apps/:slug/attachments (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let app: App
  let database: DatabaseRow
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment

    app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(APP_SLUG).build()
    database = new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug(DB_SLUG).build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(databaseTable).values(database)
    await setup.db
      .insert(databaseAttachmentTable)
      .values(
        new DatabaseAttachmentBuilder()
          .withApp(app)
          .withDatabase(database)
          .withAlias('analytics')
          .build(),
      )
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists each attachment with the variables it injects', async () => {
    const response = await request(setup.httpServer)
      .get(`/api/v1/apps/${APP_SLUG}/attachments`)
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({
      databaseSlug: DB_SLUG,
      alias: 'analytics',
      engine: 'postgres',
    })
    expect(response.body.items[0].variables[0]).toBe('ANALYTICS_DATABASE_URL')
  })

  it('rejects an unknown app with 404', async () => {
    await request(setup.httpServer)
      .get('/api/v1/apps/ghost-app/attachments')
      .set('Cookie', cookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/apps/${APP_SLUG}/attachments`).expect(401)
  })
})
