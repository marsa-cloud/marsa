import { Injectable, UnauthorizedException } from '@nestjs/common'

import { User } from '#src/app/user/entities/user.entity.js'
import { GetCurrentUserRepository } from '#src/app/user/use-cases/get-current-user/get-current-user.repository.js'
import type { Uuid } from '#src/utils/uuid.js'

@Injectable()
export class GetCurrentUserUseCase {
  constructor(private readonly repository: GetCurrentUserRepository) {}

  async execute(userUuid: Uuid): Promise<User> {
    const user = await this.repository.loadByUuid(userUuid)
    if (!user) {
      throw new UnauthorizedException('No active session.')
    }
    return user
  }
}
