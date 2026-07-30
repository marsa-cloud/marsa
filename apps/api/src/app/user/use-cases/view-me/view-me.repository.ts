import { Injectable } from '@nestjs/common'
import type { User } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewMeRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async loadByUuid(uuid: UserUuid): Promise<User | null> {
    // Shorthand `{ uuid }` doesn't typecheck: a branded uuid is an object
    // intersection, so it collides with the filter-operator shape.
    const user = await this.db.query.userTable.findFirst({ where: { uuid: { eq: uuid } } })
    return user ?? null
  }
}
