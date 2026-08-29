import { SetMetadata } from '@nestjs/common'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

export const ROLES_METADATA_KEY = 'marsa:roles'

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles)

// Only for routes a not-yet-approved user must see, so the dashboard can explain the block.
export const AllowGuest = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, [UserRole.Operator, UserRole.Member, UserRole.Guest])
