import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { Operator } from '#src/app/auth/entities/operator.entity.js'

@Injectable()
export class GetCurrentOperatorRepository {
  constructor(private readonly em: EntityManager) {}

  async loadByUuid(uuid: string): Promise<Operator | null> {
    return this.em.fork().findOne(Operator, { uuid })
  }
}
