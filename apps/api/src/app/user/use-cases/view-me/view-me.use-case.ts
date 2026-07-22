import { Injectable, UnauthorizedException } from '@nestjs/common'
import { User } from '#src/app/user/entities/user.entity.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { ViewMeRepository } from '#src/app/user/use-cases/view-me/view-me.repository.js'

@Injectable()
export class ViewMeUseCase {
  constructor(private readonly repository: ViewMeRepository) {}

  async execute(userUuid: UserUuid): Promise<User> {
    const user = await this.repository.loadByUuid(userUuid)
    if (!user) {
      throw new UnauthorizedException('No active session.')
    }
    return user
  }
}
