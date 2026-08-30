import { SetMetadata } from '@nestjs/common'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

export const ROLES_METADATA_KEY = 'marsa:roles'
export const PUBLIC_METADATA_KEY = 'marsa:public'

// Opts a route out of both global guards: reachable by anyone, signed in or not.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_METADATA_KEY, true)

// Required on every non-public route. Declaring none admits nobody, so a route that
// forgets this is a locked door rather than an open one.
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles)
