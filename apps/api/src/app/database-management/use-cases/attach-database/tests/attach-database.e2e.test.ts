import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { DatabaseBuilder } from '#src/app/database-management/entities/database.builder.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import { databaseAttachmentTable } from '#src/app/database-management/entities/database-attachment.table.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const APP_SLUG = 'attach-e2e-app'

describe('POST /api/v1/apps/:slug/attachments (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let app: App
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment

    app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(APP_SLUG).build()
    await setup.db.insert(appTable).values(app)
    await setup.db
      .insert(databaseTable)
      .values(
        new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug('orders').build(),
      )
    await setup.db
      .insert(databaseTable)
      .values(
        new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug('analytics').build(),
      )
  })

  after(async () => {
    await setup.teardown()
  })

  it('attaches the database and reports the variables it injects', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${APP_SLUG}/attachments`)
      .set('Cookie', cookie)
      .send({ databaseSlug: 'orders' })
      .expect(201)

    expect(response.body.databaseSlug).toBe('orders')
    expect(response.body.alias).toBeNull()
    expect(response.body.variables[0]).toBe('DATABASE_URL')

    const rows = await setup.db
      .select()
      .from(databaseAttachmentTable)
      .where(eq(databaseAttachmentTable.appUuid, app.uuid))
    expect(rows).toHaveLength(1)
  })

  it('refuses a second unprefixed attachment with 409', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/apps/${APP_SLUG}/attachments`)
      .set('Cookie', cookie)
      .send({ databaseSlug: 'analytics' })
      .expect(409)
  })

  it('accepts the second attachment once it carries an alias', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${APP_SLUG}/attachments`)
      .set('Cookie', cookie)
      .send({ databaseSlug: 'analytics', alias: 'analytics' })
      .expect(201)

    expect(response.body.variables[0]).toBe('ANALYTICS_DATABASE_URL')
  })

  it('refuses attaching the same database twice with 409', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/apps/${APP_SLUG}/attachments`)
      .set('Cookie', cookie)
      .send({ databaseSlug: 'orders', alias: 'again' })
      .expect(409)
  })

  it('rejects a database from another environment with 404', async () => {
    const otherProject = new ProjectBuilder().withSlug('attach-other-project').build()
    const other = new EnvironmentBuilder().withProject(otherProject).withSlug('staging').build()
    await setup.db.insert(projectTable).values(otherProject)
    await setup.db.insert(environmentTable).values(other)
    await setup.db
      .insert(databaseTable)
      .values(new DatabaseBuilder().withEnvironmentUuid(other.uuid).withSlug('elsewhere').build())

    await request(setup.httpServer)
      .post(`/api/v1/apps/${APP_SLUG}/attachments`)
      .set('Cookie', cookie)
      .send({ databaseSlug: 'elsewhere', alias: 'far' })
      .expect(404)
  })

  it('rejects an unknown app with 404', async () => {
    await request(setup.httpServer)
      .post('/api/v1/apps/ghost-app/attachments')
      .set('Cookie', cookie)
      .send({ databaseSlug: 'orders' })
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/apps/${APP_SLUG}/attachments`)
      .send({ databaseSlug: 'orders' })
      .expect(401)
  })
})
