import { Injectable, UnauthorizedException } from '@nestjs/common'

import { User } from '#src/app/user/entities/user.entity.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { GetCurrentUserRepository } from '#src/app/user/use-cases/get-current-user/get-current-user.repository.js'

@Injectable()
export class GetCurrentUserUseCase {
  constructor(private readonly repository: GetCurrentUserRepository) {}

  async execute(userUuid: UserUuid): Promise<User> {
    const user = await this.repository.loadByUuid(userUuid)
    if (!user) {
      throw new UnauthorizedException('No active session.')
    }
    return user
  }
}
