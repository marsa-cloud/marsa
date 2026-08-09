import { SetMetadata } from '@nestjs/common'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

export const ROLES_METADATA_KEY = 'marsa:roles'

/**
 * Raises the bar above `RolesGuard`'s default (any admitted role) for one route
 * — `@Roles(UserRole.Operator)` on the admin surface.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles)

/**
 * Opts a route out of the deny-by-default gate so a Guest can reach it. Only
 * for routes a not-yet-approved user must see — `GET /auth/me`, which is how
 * the dashboard learns it should render the awaiting-approval screen.
 */
export const AllowGuest = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, [UserRole.Operator, UserRole.Member, UserRole.Guest])
