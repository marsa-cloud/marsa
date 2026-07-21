import { Enum, type EnumOptions } from '@mikro-orm/core'
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import { pgEnum } from 'drizzle-orm/pg-core'
import { User } from '#src/app/user/entities/user.entity.js'

export enum UserRole {
  Operator = 'operator',
  Member = 'member',
}

export const userRoleEnum = pgEnum('user_role_enum', UserRole)

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
