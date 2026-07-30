import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import type { GitHubAppUuid } from '#src/app/github-app/entities/github-app.uuid.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const githubInstallationTable = pgTable('github_installation', {
  uuid: uuid()
    .$type<GitHubInstallationUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  installationId: varchar('installation_id', { length: 255 }).unique().notNull(),
  accountLogin: varchar('account_login', { length: 255 }),
  appUuid: uuid('app_uuid')
    .$type<GitHubAppUuid>()
    .notNull()
    .references(() => githubAppTable.uuid, { onUpdate: 'cascade' }),
  ...timestamps,
})

export type GitHubInstallation = typeof githubInstallationTable.$inferSelect
export type NewGitHubInstallation = typeof githubInstallationTable.$inferInsert
