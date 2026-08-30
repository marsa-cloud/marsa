import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { userTable } from '#src/app/user/entities/user.table.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('RolesGuard (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(() => setup.teardown())

  it('lets an admitted role through to an app endpoint', async () => {
    const { cookie } = await setup.authenticateAs(UserRole.Member)

    await request(setup.httpServer).get('/api/v1/apps').set('Cookie', cookie).expect(200)
  })

  it('refuses a Guest on an app endpoint', async () => {
    const { cookie } = await setup.authenticateAs(UserRole.Guest)

    const response = await request(setup.httpServer)
      .get('/api/v1/apps')
      .set('Cookie', cookie)
      .expect(403)

    expect(response.body.message).toMatch(/not approved/i)
  })

  it('still lets a Guest read its own account, so the dashboard can explain why', async () => {
    const { cookie } = await setup.authenticateAs(UserRole.Guest)

    const response = await request(setup.httpServer)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.role).toBe(UserRole.Guest)
  })

  // 401 not 403 is the observable proof that SessionAuthGuard is registered ahead of
  // RolesGuard: reversed, the role gate would refuse the sessionless request first.
  it('401s without a session on a gated route', async () => {
    await request(setup.httpServer).get('/api/v1/apps').expect(401)
  })

  it('leaves unauthenticated routes alone', async () => {
    await request(setup.httpServer).get('/api/v1/auth/github').expect(302)
  })

  it('lets a Guest still reach a @Public route, so a denied user can log in again', async () => {
    const { cookie } = await setup.authenticateAs(UserRole.Guest)

    await request(setup.httpServer).get('/api/v1/auth/github').set('Cookie', cookie).expect(302)
    await request(setup.httpServer).get('/api/v1/status').set('Cookie', cookie).expect(200)
  })

  it('lets a session whose user row is gone reach a @Public route', async () => {
    const { cookie } = await setup.authenticateAs(UserRole.Guest)
    await setup.db.delete(userTable)

    await request(setup.httpServer).get('/api/v1/status').set('Cookie', cookie).expect(200)
    await request(setup.httpServer).get('/api/v1/apps').set('Cookie', cookie).expect(403)
  })
})
