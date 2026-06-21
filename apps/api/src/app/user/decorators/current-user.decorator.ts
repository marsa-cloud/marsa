import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import type { UserUuid } from '#src/app/user/entities/user.uuid.js'

/**
 * Extracts the session's `userUuid` (#62). Only meaningful behind
 * `SessionAuthGuard`, which has already rejected requests with no session.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserUuid => {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    return request.session.get('userUuid')!
  },
)
