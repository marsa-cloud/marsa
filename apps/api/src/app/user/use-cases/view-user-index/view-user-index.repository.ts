import { Injectable } from '@nestjs/common'
import { asc, gt } from 'drizzle-orm'
import { type User, userTable } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewUserIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // Ordered by uuid, not createdAt: uuidv7 is time-ordered, so one column is both the
  // oldest-first order the list wants and a total order the keyset seek can page on.
  async listUsers(limit: number, after?: UserUuid | null): Promise<User[]> {
    return this.db
      .select()
      .from(userTable)
      .where(after ? gt(userTable.uuid, after) : undefined)
      .orderBy(asc(userTable.uuid))
      .limit(limit)
  }
}
