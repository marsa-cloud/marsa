import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { userTable } from '#src/app/user/entities/user.table.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/users (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    await setup.db.insert(userTable).values(new UserBuilder().withGithubUserId('999').build())
  })

  after(() => setup.teardown())

  it('lists everyone who has signed in, with their role', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/users')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.users).toHaveLength(2)
    expect(response.body.users[0]).toMatchObject({ role: UserRole.Operator })
    expect(response.body.users[1]).toMatchObject({
      githubUserId: '999',
      role: UserRole.Guest,
    })
  })

  it('refuses a non-operator', async () => {
    await setup.db.update(userTable).set({ role: UserRole.Member })

    await request(setup.httpServer).get('/api/v1/users').set('Cookie', cookie).expect(403)
  })

  it('rejects with 401 when no session cookie is present', async () => {
    await request(setup.httpServer).get('/api/v1/users').expect(401)
  })
})
