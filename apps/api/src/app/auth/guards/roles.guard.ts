import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import {
  PUBLIC_METADATA_KEY,
  ROLES_METADATA_KEY,
} from '#src/app/auth/decorators/roles.decorator.js'
import { UserRoleService } from '#src/app/auth/services/user-role/user-role.service.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

const DENIED = 'Your account is not approved for this action.'

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly userRoles: UserRoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_METADATA_KEY, targets)) {
      return true
    }

    const allowed = this.reflector.getAllAndOverride<UserRole[]>(ROLES_METADATA_KEY, targets)
    if (!allowed?.length) {
      // Logged apart from a genuine denial: the client sees the same 403 either way, and
      // without this line a misconfigured route is indistinguishable from a real refusal.
      this.logger.error(
        `${context.getClass().name} declares no roles and is not @Public — refusing everyone.`,
      )
      throw new ForbiddenException(DENIED)
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const userUuid = request.session.get('userUuid')
    if (!userUuid) {
      throw new ForbiddenException(DENIED)
    }

    const role = await this.userRoles.loadRole(userUuid)
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException(DENIED)
    }
    return true
  }
}
