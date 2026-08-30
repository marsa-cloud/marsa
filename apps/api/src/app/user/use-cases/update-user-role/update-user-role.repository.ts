import { Injectable } from '@nestjs/common'
import { count, eq, sql } from 'drizzle-orm'
import { type User, userTable } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { AdvisoryLock } from '#src/modules/database/advisory-locks.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

export type UpdateRoleOutcome =
  | { status: 'updated'; user: User }
  | { status: 'not-found' }
  | { status: 'last-operator' }

@Injectable()
export class UpdateUserRoleRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // Refusing a self-change does not keep an operator: two operators demoting each other
  // concurrently would both pass that check. The lock makes the population change serialisable.
  async updateRole(uuid: UserUuid, role: UserRole): Promise<UpdateRoleOutcome> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${AdvisoryLock.UserBootstrap})`)

      const [target] = await tx.select().from(userTable).where(eq(userTable.uuid, uuid))
      if (!target) {
        return { status: 'not-found' }
      }

      if (target.role === UserRole.Operator && role !== UserRole.Operator) {
        const [operators] = await tx
          .select({ total: count() })
          .from(userTable)
          .where(eq(userTable.role, UserRole.Operator))
        if ((operators?.total ?? 0) <= 1) {
          return { status: 'last-operator' }
        }
      }

      const [updated] = await tx
        .update(userTable)
        .set({ role, updatedAt: new Date() })
        .where(eq(userTable.uuid, uuid))
        .returning()
      return updated ? { status: 'updated', user: updated } : { status: 'not-found' }
    })
  }
}
