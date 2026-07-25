import type { User } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { generateUuid } from '#src/utils/uuid.js'

export class UserBuilder {
  private readonly user: User

  constructor() {
    const now = new Date()
    this.user = {
      uuid: generateUuid<UserUuid>(),
      githubUserId: '1',
      githubLogin: 'marsa-user',
      role: UserRole.Member,
      createdAt: now,
      updatedAt: now,
    }
  }

  withGithubUserId(githubUserId: string): this {
    this.user.githubUserId = githubUserId
    return this
  }

  withGithubLogin(githubLogin: string): this {
    this.user.githubLogin = githubLogin
    return this
  }

  withRole(role: UserRole): this {
    this.user.role = role
    return this
  }

  build(): User {
    return this.user
  }
}
