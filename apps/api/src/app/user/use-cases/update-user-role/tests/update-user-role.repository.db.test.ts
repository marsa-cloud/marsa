import { after, before, beforeEach, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { userTable } from '#src/app/user/entities/user.table.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { UpdateUserRoleModule } from '#src/app/user/use-cases/update-user-role/update-user-role.module.js'
import { UpdateUserRoleRepository } from '#src/app/user/use-cases/update-user-role/update-user-role.repository.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

// Unreachable over HTTP: the self-change rule and operator-only guard block every
// single-request path to it, so the branch is driven directly. Concurrency is its case.
describe('UpdateUserRoleRepository (db)', () => {
  let setup: TestSetup
  let repository: UpdateUserRoleRepository

  before(async () => {
    setup = await TestBench.setupModuleTest(UpdateUserRoleModule)
    repository = setup.testModule.get(UpdateUserRoleRepository)
  })

  beforeEach(() => setup.teardown())

  after(() => setup.teardown())

  async function seedOperators(count: number) {
    const operators = Array.from({ length: count }, (_, index) =>
      new UserBuilder()
        .withGithubUserId(`${100 + index}`)
        .withRole(UserRole.Operator)
        .build(),
    )
    await setup.db.insert(userTable).values(operators)
    return operators
  }

  it('refuses to demote the only operator', async () => {
    const [only] = await seedOperators(1)

    expect(await repository.updateRole(only.uuid, UserRole.Member)).toEqual({
      status: 'last-operator',
    })
  })

  it('keeps one operator when two demote each other concurrently', async () => {
    const [first, second] = await seedOperators(2)

    const outcomes = await Promise.all([
      repository.updateRole(first.uuid, UserRole.Member),
      repository.updateRole(second.uuid, UserRole.Member),
    ])

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['last-operator', 'updated'])

    const survivors = await setup.db
      .select()
      .from(userTable)
      .where(eq(userTable.role, UserRole.Operator))
    expect(survivors).toHaveLength(1)
  })

  it('allows a demotion while another operator remains', async () => {
    const [first] = await seedOperators(2)

    expect((await repository.updateRole(first.uuid, UserRole.Member)).status).toBe('updated')
  })

  it('reports a missing row rather than throwing', async () => {
    const absent = new UserBuilder().build()

    expect(await repository.updateRole(absent.uuid, UserRole.Member)).toEqual({
      status: 'not-found',
    })
  })
})
