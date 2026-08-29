import { SetMetadata } from '@nestjs/common'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

export const ROLES_METADATA_KEY = 'marsa:roles'
export const PUBLIC_METADATA_KEY = 'marsa:public'

// A session must not gate a route that never needed one: without this a denied Guest 403s on
// the login route itself, and with no logout endpoint the cookie can never be cleared.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_METADATA_KEY, true)

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles)

// Only for routes a not-yet-approved user must see, so the dashboard can explain the block.
export const AllowGuest = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, [UserRole.Operator, UserRole.Member, UserRole.Guest])
