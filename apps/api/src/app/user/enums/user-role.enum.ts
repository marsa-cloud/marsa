import { Enum, type EnumOptions } from '@mikro-orm/core'
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

import { User } from '#src/app/user/entities/user.entity.js'

export enum UserRole {
  Operator = 'operator',
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
