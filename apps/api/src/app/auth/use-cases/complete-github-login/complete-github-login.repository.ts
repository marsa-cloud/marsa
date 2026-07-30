import { Injectable } from '@nestjs/common'
import { and, eq, gt, sql } from 'drizzle-orm'
import { oauthStateTable } from '#src/app/auth/entities/oauth-state.table.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { type GitHubApp } from '#src/app/github-app/entities/github-app.table.js'
import { type User, userTable } from '#src/app/user/entities/user.table.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

const USER_BOOTSTRAP_LOCK_KEY = 49170001

@Injectable()
export class CompleteGithubLoginRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async loadProvisionedApp(): Promise<GitHubApp | null> {
    const app = await this.db.query.githubAppTable.findFirst({
      orderBy: { createdAt: 'desc' },
    })
    return app ?? null
  }

  /**
   * Without this two concurrent first logins can both read a user count of zero
   * and both claim Operator; the lock releases when the transaction ends.
   */
  async lockUserBootstrap(tx: Executor): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(${USER_BOOTSTRAP_LOCK_KEY})`)
  }

  async consumeState(tx: Executor, state: OAuthStateUuid): Promise<boolean> {
    const consumed = await tx
      .delete(oauthStateTable)
      .where(and(eq(oauthStateTable.uuid, state), gt(oauthStateTable.expiresAt, new Date())))
      .returning()
    return consumed.length === 1
  }

  async countUsers(tx: Executor): Promise<number> {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(userTable)
    return count
  }

  /** role/createdAt are insert-only, so a returning user keeps the role they were given. */
  async upsertUser(tx: Executor, user: User): Promise<User> {
    const [upserted] = await tx
      .insert(userTable)
      .values(user)
      .onConflictDoUpdate({
        target: userTable.githubUserId,
        set: { githubLogin: user.githubLogin, updatedAt: user.updatedAt },
      })
      .returning()
    return upserted
  }
}
