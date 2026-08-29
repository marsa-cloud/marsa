import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { ROLES_METADATA_KEY } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRoleService } from '#src/app/auth/services/user-role/user-role.service.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

const ADMITTED_ROLES = [UserRole.Operator, UserRole.Member]

// Registered globally, so a route added later is closed by default rather than open.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userRoles: UserRoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    // No session means the route is public by design, or SessionAuthGuard already refused it.
    const userUuid = request.session.get('userUuid')
    if (!userUuid) {
      return true
    }

    const allowed =
      this.reflector.getAllAndOverride<UserRole[]>(ROLES_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ADMITTED_ROLES

    const role = await this.userRoles.loadRole(userUuid)
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException('Your account is not approved for this action.')
    }
    return true
  }
}
