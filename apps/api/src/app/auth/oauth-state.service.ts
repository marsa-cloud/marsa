import { Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import dayjs from 'dayjs'
import { and, eq, gt } from 'drizzle-orm'
import { OAuthStateBuilder } from '#src/app/auth/entities/oauth-state.builder.js'
import { oauthStateTable } from '#src/app/auth/entities/oauth-state.table.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

const DEFAULT_TTL_MINUTES = 10

/**
 * DB-backed, single-use CSRF state for the user-OAuth round-trip (#62).
 *
 * Mirrors `ManifestStateService` (AgDR-0010) rather than reusing it directly —
 * the two states protect different flows and the table/feature is kept
 * feature-internal per the "feature-internal code stays inside the feature
 * folder" convention.
 */
@Injectable()
export class OAuthStateService {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async issue(ttlMinutes: number = DEFAULT_TTL_MINUTES): Promise<OAuthStateUuid> {
    const state = new OAuthStateBuilder()
      .withExpiresAt(dayjs().add(ttlMinutes, 'minute').toDate())
      .build()
    await this.db.insert(oauthStateTable).values(state)
    return state.uuid
  }

  async consume(state: OAuthStateUuid): Promise<boolean> {
    if (!isUUID(state)) {
      return false
    }
    // Atomic conditional delete → verifies at most once, no replay.
    const deleted = await this.db
      .delete(oauthStateTable)
      .where(and(eq(oauthStateTable.uuid, state), gt(oauthStateTable.expiresAt, dayjs().toDate())))
      .returning()
    return deleted.length === 1
  }
}
