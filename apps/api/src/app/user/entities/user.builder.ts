import { User, UserRole } from '#src/app/user/entities/user.entity.js'

export class UserBuilder {
  private readonly user: User

  constructor() {
    this.user = new User()
    this.user.githubUserId = '1'
    this.user.githubLogin = 'marsa-user'
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
