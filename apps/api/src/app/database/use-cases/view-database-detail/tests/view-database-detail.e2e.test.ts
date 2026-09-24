import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { DatabaseCredentialsCipher } from '#src/modules/crypto/database-credentials.cipher.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'detail-db-e2e'

describe('GET /api/v1/databases/:slug (e2e)', () => {
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

  it('returns the database without its credentials', async () => {
    const cipher = setup.testModule.get(DatabaseCredentialsCipher)
    await setup.db.insert(databaseTable).values(
      new DatabaseBuilder()
        .withEnvironmentUuid(environment.uuid)
        .withSlug(SLUG)
        .withCredentialsEnc(
          cipher.seal({ user: 'postgres', password: 'super-secret', database: 'detail_db_e2e' }),
        )
        .build(),
    )

    const response = await request(setup.httpServer)
      .get(`/api/v1/databases/${SLUG}`)
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body).toMatchObject({
      slug: SLUG,
      engine: 'postgres',
      version: '17',
      image: 'postgres:17.11',
      storageGib: 10,
      status: 'not_found',
      nodePin: null,
    })
    expect(JSON.stringify(response.body)).not.toContain('super-secret')
    expect(JSON.stringify(response.body)).not.toContain('password')
    expect(response.body).not.toHaveProperty('connection')
  })

  it('returns 404 for a slug that does not exist', async () => {
    await request(setup.httpServer)
      .get('/api/v1/databases/no-such-db')
      .set('Cookie', cookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get(`/api/v1/databases/${SLUG}`).expect(401)
  })
})
