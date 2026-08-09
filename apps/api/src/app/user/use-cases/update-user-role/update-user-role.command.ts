import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

export class UpdateUserRoleCommand {
  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.Member })
  @IsEnum(UserRole)
  role!: UserRole
}
