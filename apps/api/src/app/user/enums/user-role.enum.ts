import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * `Guest` is the deny-by-default tier every new sign-in lands on (#63): a real
 * user row, keyed on the GitHub id, with access to nothing until an operator
 * promotes it. Retired once invite-by-login lands (#192).
 */
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
