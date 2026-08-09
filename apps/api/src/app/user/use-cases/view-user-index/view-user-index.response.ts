import { ApiProperty } from '@nestjs/swagger'
import type { User } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole, UserRoleApiProperty } from '#src/app/user/enums/user-role.enum.js'

export class UserSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: UserUuid

  @ApiProperty({ type: String, example: '1' })
  readonly githubUserId: string

  @ApiProperty({ type: String, example: 'octocat' })
  readonly login: string

  @UserRoleApiProperty({ example: UserRole.Guest })
  readonly role: UserRole

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(user: User) {
    this.uuid = user.uuid
    this.githubUserId = user.githubUserId
    this.login = user.githubLogin
    this.role = user.role
    this.createdAt = user.createdAt.toISOString()
  }
}

export class ViewUserIndexResponse {
  @ApiProperty({ type: [UserSummary] })
  readonly users: UserSummary[]

  constructor(users: User[]) {
    this.users = users.map((user) => new UserSummary(user))
  }
}
