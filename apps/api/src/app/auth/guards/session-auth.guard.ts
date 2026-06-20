import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

/**
 * Protects a route behind a valid `@fastify/secure-session` cookie (#62).
 * Throws 401 when the session carries no `userUuid`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const userUuid = request.session.get('userUuid')
    if (!userUuid) {
      throw new UnauthorizedException('No active session.')
    }
    return true
  }
}
