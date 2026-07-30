import { sql } from 'drizzle-orm'
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const oauthStateTable = pgTable('auth_oauth_state', {
  uuid: uuid()
    .$type<OAuthStateUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamps.createdAt,
})

export type OAuthState = typeof oauthStateTable.$inferSelect
export type NewOAuthState = typeof oauthStateTable.$inferInsert
