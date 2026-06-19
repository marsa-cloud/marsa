import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { User } from '#src/app/user/entities/user.entity.js'
import type { Uuid } from '#src/utils/uuid.js'

@Injectable()
export class GetCurrentUserRepository {
  constructor(private readonly em: EntityManager) {}

  async loadByUuid(uuid: Uuid): Promise<User | null> {
    return this.em.fork().findOne(User, { uuid })
  }
}
