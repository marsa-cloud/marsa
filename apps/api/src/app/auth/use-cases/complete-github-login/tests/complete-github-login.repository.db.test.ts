import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import { CompleteGithubLoginModule } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.module.js'
import { CompleteGithubLoginRepository } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.repository.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import type { User } from '#src/app/user/entities/user.table.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('CompleteGithubLoginRepository (db)', () => {
  let setup: TestSetup
  let repository: CompleteGithubLoginRepository

  before(async () => {
    setup = await TestBench.setupModuleTest(CompleteGithubLoginModule)
    repository = setup.testModule.get(CompleteGithubLoginRepository)
  })

  after(async () => {
    await setup.teardown()
  })

  it('lets only one of two concurrent first logins claim Operator', async () => {
    const bootstrap = (githubUserId: string): Promise<User> =>
      setup.db.transaction(async (tx) => {
        await repository.lockUserBootstrap(tx)
        const role = (await repository.countUsers(tx)) === 0 ? UserRole.Operator : UserRole.Member
        return repository.upsertUser(
          tx,
          new UserBuilder().withGithubUserId(githubUserId).withRole(role).build(),
        )
      })

    const users = await Promise.all([bootstrap('9001'), bootstrap('9002')])

    expect(users.filter((user) => user.role === UserRole.Operator)).toHaveLength(1)
    expect(users.filter((user) => user.role === UserRole.Member)).toHaveLength(1)
  })
})
