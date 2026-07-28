import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type User, userTable } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewMeRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async loadByUuid(uuid: UserUuid): Promise<User | null> {
    const [user] = await this.db.select().from(userTable).where(eq(userTable.uuid, uuid)).limit(1)
    return user ?? null
  }
}
