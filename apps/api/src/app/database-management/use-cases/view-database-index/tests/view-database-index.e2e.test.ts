import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { DatabaseBuilder } from '#src/app/database-management/entities/database.builder.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/databases (e2e)', () => {
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

  it('lists databases with their live status and never a credential', async () => {
    await setup.db
      .insert(databaseTable)
      .values(
        new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug('orders').build(),
      )

    const response = await request(setup.httpServer)
      .get('/api/v1/databases')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({
      slug: 'orders',
      engine: 'postgres',
      version: '17',
      // Nothing was provisioned through the runtime, so there is nothing to observe.
      status: 'not_found',
      project: { slug: 'my-project' },
      environment: { slug: 'production' },
    })
    expect(JSON.stringify(response.body)).not.toContain('credentialsEnc')
    expect(JSON.stringify(response.body)).not.toContain('PGPASSWORD')
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/databases').expect(401)
  })
})
