import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { DatabaseBuilder } from '#src/app/database-management/entities/database.builder.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import { DatabaseAttachmentBuilder } from '#src/app/database-management/entities/database-attachment.builder.js'
import { databaseAttachmentTable } from '#src/app/database-management/entities/database-attachment.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { MockDatabaseRuntime } from '#src/modules/runtime/adapters/mock/mock-database-runtime.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'delete-db-e2e'

describe('DELETE /api/v1/databases/:slug (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
  })

  after(async () => {
    await setup.teardown()
  })

  it('removes the database row', async () => {
    await setup.db
      .insert(databaseTable)
      .values(new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug(SLUG).build())

    await request(setup.httpServer)
      .delete(`/api/v1/databases/${SLUG}`)
      .set('Cookie', cookie)
      .expect(204)

    const rows = await setup.db.select().from(databaseTable).where(eq(databaseTable.slug, SLUG))
    expect(rows).toHaveLength(0)
  })

  it('returns 404 for a slug that does not exist', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/databases/no-such-db')
      .set('Cookie', cookie)
      .expect(404)
  })

  it('keeps the database when the runtime cannot remove it', async () => {
    const slug = 'delete-db-stuck'
    await setup.db
      .insert(databaseTable)
      .values(new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build())
    setup.testModule
      .get<DatabaseRuntime, MockDatabaseRuntime>(DatabaseRuntime)
      .failNext('destroy', new Error('cluster down'))

    await request(setup.httpServer)
      .delete(`/api/v1/databases/${slug}`)
      .set('Cookie', cookie)
      .expect(502)

    const rows = await setup.db.select().from(databaseTable).where(eq(databaseTable.slug, slug))
    expect(rows).toHaveLength(1)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).delete(`/api/v1/databases/${SLUG}`).expect(401)
  })

  it('refuses with 409 while an app is still attached, naming the app', async () => {
    const slug = 'delete-db-attached'
    const database = new DatabaseBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(slug)
      .build()
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('delete-db-dependent')
      .build()
    await setup.db.insert(databaseTable).values(database)
    await setup.db.insert(appTable).values(app)
    await setup.db
      .insert(databaseAttachmentTable)
      .values(new DatabaseAttachmentBuilder().withApp(app).withDatabase(database).build())

    const response = await request(setup.httpServer)
      .delete(`/api/v1/databases/${slug}`)
      .set('Cookie', cookie)
      .expect(409)

    expect(response.body.message).toContain('delete-db-dependent')

    const rows = await setup.db.select().from(databaseTable).where(eq(databaseTable.slug, slug))
    expect(rows).toHaveLength(1)
  })
})
