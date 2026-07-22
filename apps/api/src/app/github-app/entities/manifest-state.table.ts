import { sql } from 'drizzle-orm'
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const manifestStateTable = pgTable('github_app_manifest_state', {
  uuid: uuid()
    .$type<ManifestStateUuid>()
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamps.createdAt,
})

export type ManifestState = typeof manifestStateTable.$inferSelect
export type NewManifestState = typeof manifestStateTable.$inferInsert
