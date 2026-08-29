import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { userTable } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('PATCH /api/v1/users/:uuid/role (e2e)', () => {
  let setup: TestSetup
  let cookie: string
  let operator: UserUuid
  let guest: UserUuid

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    ;({ cookie, uuid: operator } = await setup.authenticateAs(UserRole.Operator))
    const user = new UserBuilder().withGithubUserId('999').build()
    await setup.db.insert(userTable).values(user)
    guest = user.uuid
  })

  after(() => setup.teardown())

  it('promotes a Guest to Member', async () => {
    const response = await request(setup.httpServer)
      .patch(`/api/v1/users/${guest}/role`)
      .set('Cookie', cookie)
      .send({ role: UserRole.Member })
      .expect(200)

    expect(response.body).toMatchObject({ uuid: guest, role: UserRole.Member })

    const stored = await setup.db.query.userTable.findFirst({ where: { githubUserId: '999' } })
    expect(stored?.role).toBe(UserRole.Member)
  })

  it('refuses an operator changing their own role', async () => {
    await request(setup.httpServer)
      .patch(`/api/v1/users/${operator}/role`)
      .set('Cookie', cookie)
      .send({ role: UserRole.Member })
      .expect(400)
  })

  // A second operator first, or the last-operator check answers 400 on its own and the
  // casing bypass this asserts against would pass unnoticed.
  it('refuses a self-change disguised by uuid casing', async () => {
    await request(setup.httpServer)
      .patch(`/api/v1/users/${guest}/role`)
      .set('Cookie', cookie)
      .send({ role: UserRole.Operator })
      .expect(200)

    await request(setup.httpServer)
      .patch(`/api/v1/users/${operator.toUpperCase()}/role`)
      .set('Cookie', cookie)
      .send({ role: UserRole.Member })
      .expect(400)

    const stored = await setup.db.query.userTable.findFirst({ where: { githubUserId: '1' } })
    expect(stored?.role).toBe(UserRole.Operator)
  })

  it('rejects an unknown role', async () => {
    await request(setup.httpServer)
      .patch(`/api/v1/users/${guest}/role`)
      .set('Cookie', cookie)
      .send({ role: 'superuser' })
      .expect(400)
  })

  it('404s on a user that does not exist', async () => {
    await request(setup.httpServer)
      .patch(`/api/v1/users/${generateUuid<UserUuid>()}/role`)
      .set('Cookie', cookie)
      .send({ role: UserRole.Member })
      .expect(404)
  })
})
