import { Injectable } from '@nestjs/common'
import { asc, gt } from 'drizzle-orm'
import { type User, userTable } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewUserIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /**
   * One page of users, oldest first so the bootstrapping operator leads the
   * list. Ascending, so the seek is `>` rather than `<`.
   */
  async listUsers(limit: number, after?: UserUuid | null): Promise<User[]> {
    return this.db
      .select()
      .from(userTable)
      .where(after ? gt(userTable.uuid, after) : undefined)
      .orderBy(asc(userTable.uuid))
      .limit(limit)
  }
}
