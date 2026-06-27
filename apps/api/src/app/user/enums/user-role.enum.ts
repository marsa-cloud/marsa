import { Enum, type EnumOptions } from '@mikro-orm/core'
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

import { User } from '#src/app/user/entities/user.entity.js'

export enum UserRole {
  /** Platform owner / admin. Assigned to the first user to complete login. */
  Operator = 'operator',
  /** Default tier for every user after the first. */
  Member = 'member',
}

export const UserRoleApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({
    ...options,
    enum: UserRole,
    enumName: 'UserRole',
  })

export function UserRoleEnum(options?: EnumOptions<Partial<User>>) {
  return Enum({
    ...options,
    items: () => UserRole,
    nativeEnumName: 'user_role_enum',
  })
}
