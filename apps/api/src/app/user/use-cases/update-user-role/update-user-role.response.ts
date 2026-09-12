import { ApiProperty } from '@nestjs/swagger'
import type { User } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole, UserRoleApiProperty } from '#src/app/user/enums/user-role.enum.js'

export class UpdateUserRoleResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: UserUuid

  @ApiProperty({ type: String, example: 'octocat' })
  readonly login: string

  @UserRoleApiProperty({ example: UserRole.Member })
  readonly role: UserRole

  constructor(user: User) {
    this.uuid = user.uuid
    this.login = user.githubLogin
    this.role = user.role
  }
}
