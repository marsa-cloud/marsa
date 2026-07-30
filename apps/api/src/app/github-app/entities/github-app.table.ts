import { sql } from 'drizzle-orm'
import { pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import type { GitHubAppUuid } from '#src/app/github-app/entities/github-app.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const githubAppTable = pgTable('github_app', {
  uuid: uuid()
    .$type<GitHubAppUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  githubAppId: varchar('github_app_id', { length: 255 }).unique().notNull(),
  slug: varchar({ length: 255 }).unique().notNull(),
  name: varchar({ length: 255 }).notNull(),
  htmlUrl: varchar('html_url', { length: 255 }).notNull(),
  ownerLogin: varchar('owner_login', { length: 255 }),
  clientId: varchar('client_id', { length: 255 }).notNull(),
  clientSecretEnc: text('client_secret_enc').notNull(),
  webhookSecretEnc: text('webhook_secret_enc').notNull(),
  privateKeyPemEnc: text('private_key_pem_enc').notNull(),
  ...timestamps,
})

export type GitHubApp = typeof githubAppTable.$inferSelect
export type NewGitHubApp = typeof githubAppTable.$inferInsert
