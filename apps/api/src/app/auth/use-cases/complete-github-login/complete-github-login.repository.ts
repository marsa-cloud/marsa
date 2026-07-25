import { Injectable } from '@nestjs/common'
import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { oauthStateTable } from '#src/app/auth/entities/oauth-state.table.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { type GitHubApp, githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { type User, userTable } from '#src/app/user/entities/user.table.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CompleteGithubLoginRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async loadProvisionedApp(): Promise<GitHubApp | null> {
    const [app] = await this.db
      .select()
      .from(githubAppTable)
      .orderBy(desc(githubAppTable.createdAt))
      .limit(1)
    return app ?? null
  }

  /**
   * Consume the single-use OAuth state, assign a role (first user → Operator),
   * and upsert the user — atomically, so a failed upsert releases the state and
   * two concurrent first-logins can't both claim Operator. Returns null when the
   * state is invalid/expired (nothing written).
   *
   * role/createdAt are insert-only: a returning user keeps their role rather than
   * being demoted to the role computed for this login.
   */
  async consumeStateAndUpsertUser(
    state: OAuthStateUuid,
    githubUserId: string,
    githubLogin: string,
  ): Promise<User | null> {
    return this.db.transaction(async (tx) => {
      const consumed = await tx
        .delete(oauthStateTable)
        .where(and(eq(oauthStateTable.uuid, state), gt(oauthStateTable.expiresAt, new Date())))
        .returning()
      if (consumed.length !== 1) {
        return null
      }

      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(userTable)
      const role = count === 0 ? UserRole.Operator : UserRole.Member

      const user = new UserBuilder()
        .withGithubUserId(githubUserId)
        .withGithubLogin(githubLogin)
        .withRole(role)
        .build()

      const [upserted] = await tx
        .insert(userTable)
        .values(user)
        .onConflictDoUpdate({
          target: userTable.githubUserId,
          set: { githubLogin: user.githubLogin, updatedAt: user.updatedAt },
        })
        .returning()
      return upserted
    })
  }
}
