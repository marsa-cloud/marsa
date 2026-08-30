import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { PUBLIC_METADATA_KEY } from '#src/app/auth/decorators/roles.decorator.js'

// Registered globally and ahead of RolesGuard, so every route needs a session unless it
// says otherwise. RolesGuard can then assume one is present.
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    if (!request.session.get('userUuid')) {
      throw new UnauthorizedException('No active session.')
    }
    return true
  }
}
