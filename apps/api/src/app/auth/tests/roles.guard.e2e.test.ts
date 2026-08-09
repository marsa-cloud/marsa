import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { userTable } from '#src/app/user/entities/user.table.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

/**
 * `authenticate()` bootstraps the first user, who is always the Operator. Demoting
 * that row turns the same cookie into a Guest session — the role is read per
 * request, not stamped into the cookie.
 */
async function demoteToGuest(setup: TestSetup): Promise<void> {
  await setup.db.update(userTable).set({ role: UserRole.Guest })
}

describe('RolesGuard (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(() => setup.teardown())

  it('lets an admitted role through to an app endpoint', async () => {
    await request(setup.httpServer).get('/api/v1/apps').set('Cookie', cookie).expect(200)
  })

  it('refuses a Guest on an app endpoint', async () => {
    await demoteToGuest(setup)

    const response = await request(setup.httpServer)
      .get('/api/v1/apps')
      .set('Cookie', cookie)
      .expect(403)

    expect(response.body.message).toMatch(/not approved/i)
  })

  it('still lets a Guest read its own account, so the dashboard can explain why', async () => {
    await demoteToGuest(setup)

    const response = await request(setup.httpServer)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.role).toBe(UserRole.Guest)
  })

  it('leaves unauthenticated routes alone', async () => {
    await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
  })
})
