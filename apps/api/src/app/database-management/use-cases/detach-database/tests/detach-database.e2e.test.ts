import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
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

const APP_SLUG = 'detach-e2e-app'
const DB_SLUG = 'detach-e2e-db'

describe('DELETE /api/v1/apps/:slug/attachments/:databaseSlug (e2e)', () => {
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
      .values(new DatabaseAttachmentBuilder().withApp(app).withDatabase(database).build())
  })

  after(async () => {
    await setup.teardown()
  })

  it('removes the attachment', async () => {
    await request(setup.httpServer)
      .delete(`/api/v1/apps/${APP_SLUG}/attachments/${DB_SLUG}`)
      .set('Cookie', cookie)
      .expect(204)

    const rows = await setup.db
      .select()
      .from(databaseAttachmentTable)
      .where(eq(databaseAttachmentTable.appUuid, app.uuid))
    expect(rows).toHaveLength(0)
  })

  it('answers 404 when that database is not attached', async () => {
    await request(setup.httpServer)
      .delete(`/api/v1/apps/${APP_SLUG}/attachments/${DB_SLUG}`)
      .set('Cookie', cookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer)
      .delete(`/api/v1/apps/${APP_SLUG}/attachments/${DB_SLUG}`)
      .expect(401)
  })
})
