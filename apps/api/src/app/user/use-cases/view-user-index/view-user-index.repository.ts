import { Injectable } from '@nestjs/common'
import { type User } from '#src/app/user/entities/user.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewUserIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // Oldest first, so the bootstrapping operator leads the list.
  async listUsers(): Promise<User[]> {
    // uuidv7 is time-ordered, so it breaks a createdAt tie without changing the intent.
    return this.db.query.userTable.findMany({ orderBy: { createdAt: 'asc', uuid: 'asc' } })
  }
}
