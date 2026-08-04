import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import { pgEnum } from 'drizzle-orm/pg-core'

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
