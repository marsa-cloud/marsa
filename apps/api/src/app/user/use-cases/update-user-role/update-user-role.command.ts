import { IsEnum } from 'class-validator'
import { UserRole, UserRoleApiProperty } from '#src/app/user/enums/user-role.enum.js'

export class UpdateUserRoleCommand {
  @UserRoleApiProperty({ example: UserRole.Member })
  @IsEnum(UserRole)
  role!: UserRole
}
