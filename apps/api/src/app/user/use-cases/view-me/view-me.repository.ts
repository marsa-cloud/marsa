import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'
import { User } from '#src/app/user/entities/user.entity.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'

@Injectable()
export class ViewMeRepository {
  constructor(private readonly em: EntityManager) {}

  async loadByUuid(uuid: UserUuid): Promise<User | null> {
    return this.em.fork().findOne(User, { uuid })
  }
}
