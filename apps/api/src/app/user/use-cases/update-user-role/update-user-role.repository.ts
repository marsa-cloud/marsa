import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type User, userTable } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import type { UserRole } from '#src/app/user/enums/user-role.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class UpdateUserRoleRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async updateRole(uuid: UserUuid, role: UserRole): Promise<User | null> {
    const [updated] = await this.db
      .update(userTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(userTable.uuid, uuid))
      .returning()
    return updated ?? null
  }
}
