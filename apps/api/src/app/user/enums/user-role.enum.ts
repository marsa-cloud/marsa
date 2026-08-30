import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import { pgEnum } from 'drizzle-orm/pg-core'

// Guest is the deny-by-default tier every new sign-in lands on; retired once #192 lands.
export enum UserRole {
  Operator = 'operator',
  Member = 'member',
  Guest = 'guest',
}

export const userRoleEnum = pgEnum('user_role_enum', UserRole)

export const UserRoleApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({
    ...options,
    enum: UserRole,
    enumName: 'UserRole',
  })
