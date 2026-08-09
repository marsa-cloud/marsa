import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { userTable } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import type { UserRole } from '#src/app/user/enums/user-role.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

/**
 * Reads the current role of a session's user for `RolesGuard` (#63). Read per
 * request rather than stamped into the session cookie, so an operator's
 * promotion takes effect on the promoted user's next request instead of their
 * next login.
 */
@Injectable()
export class UserRoleService {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async loadRole(uuid: UserUuid): Promise<UserRole | null> {
    const [user] = await this.db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.uuid, uuid))
    return user?.role ?? null
  }
}
