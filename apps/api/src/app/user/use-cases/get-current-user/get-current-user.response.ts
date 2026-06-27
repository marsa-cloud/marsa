import { ApiProperty } from '@nestjs/swagger'

import { User } from '#src/app/user/entities/user.entity.js'
import { UserRole, UserRoleApiProperty } from '#src/app/user/enums/user-role.enum.js'

export class GetCurrentUserResponse {
  @ApiProperty({ type: String, example: '1' })
  readonly id: string

  @ApiProperty({ type: String, example: 'octocat' })
  readonly login: string

  @UserRoleApiProperty({ example: UserRole.Operator })
  readonly role: UserRole

  constructor(user: User) {
    this.id = user.githubUserId
    this.login = user.githubLogin
    this.role = user.role
  }
}
