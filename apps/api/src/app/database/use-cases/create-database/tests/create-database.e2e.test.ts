import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { MockDatabaseRuntime } from '#src/modules/runtime/adapters/mock/mock-database-runtime.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

const SLUG = 'create-db-e2e'

describe('POST /api/v1/databases (e2e)', () => {
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

  it('creates the database and answers with its in-cluster address', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/databases')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug: SLUG,
        engine: 'postgres',
        version: '17',
        storageGib: 2,
      })
      .expect(201)

    expect(response.body).toEqual({
      slug: SLUG,
      engine: 'postgres',
      version: '17',
      host: SLUG,
      port: 5432,
    })
    expect(JSON.stringify(response.body)).not.toContain('PGPASSWORD')

    const [database] = await setup.db
      .select()
      .from(databaseTable)
      .where(eq(databaseTable.slug, SLUG))
    expect(database.image).toBe('postgres:17.11')
    expect(database.storageGib).toBe(2)
    expect(database.credentialsEnc).not.toContain('postgres')
  })

  it('rejects a name an app in the same environment already uses with 409', async () => {
    await setup.db
      .insert(appTable)
      .values(
        new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug('taken-by-app').build(),
      )

    await request(setup.httpServer)
      .post('/api/v1/databases')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug: 'taken-by-app',
        engine: 'postgres',
        version: '17',
      })
      .expect(409)
  })

  it('rejects a name a database in another environment already uses with 409', async () => {
    const otherProject = new ProjectBuilder().withSlug('other-project').build()
    const other = new EnvironmentBuilder().withProject(otherProject).withSlug('staging').build()
    await setup.db.insert(projectTable).values(otherProject)
    await setup.db.insert(environmentTable).values(other)

    await request(setup.httpServer)
      .post('/api/v1/databases')
      .set('Cookie', cookie)
      .send({
        environmentUuid: other.uuid,
        slug: SLUG,
        engine: 'postgres',
        version: '17',
      })
      .expect(409)
  })

  it('rejects an unknown environment with 404', async () => {
    await request(setup.httpServer)
      .post('/api/v1/databases')
      .set('Cookie', cookie)
      .send({
        environmentUuid: generateUuid<EnvironmentUuid>(),
        slug: 'create-db-orphan',
        engine: 'postgres',
        version: '17',
      })
      .expect(404)
  })

  for (const [reason, slug] of [
    ['starts with a digit', '1-create-db'],
    ['is longer than 52 characters', 'd'.repeat(53)],
  ]) {
    it(`rejects a slug that ${reason} with 400`, async () => {
      await request(setup.httpServer)
        .post('/api/v1/databases')
        .set('Cookie', cookie)
        .send({ environmentUuid: environment.uuid, slug, engine: 'postgres', version: '17' })
        .expect(400)
    })
  }

  it('rejects an unsupported version with 400', async () => {
    await request(setup.httpServer)
      .post('/api/v1/databases')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug: 'create-db-old',
        engine: 'postgres',
        version: '15',
      })
      .expect(400)
  })

  it('keeps no row when the runtime cannot provision it', async () => {
    const slug = 'create-db-stuck'
    setup.testModule
      .get<DatabaseRuntime, MockDatabaseRuntime>(DatabaseRuntime)
      .failNext('provision', new Error('cluster down'))

    await request(setup.httpServer)
      .post('/api/v1/databases')
      .set('Cookie', cookie)
      .send({
        environmentUuid: environment.uuid,
        slug,
        engine: 'postgres',
        version: '17',
      })
      .expect(502)

    const rows = await setup.db.select().from(databaseTable).where(eq(databaseTable.slug, slug))
    expect(rows).toHaveLength(0)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).post('/api/v1/databases').send({}).expect(401)
  })
})
