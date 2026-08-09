import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { userRoleEnum } from '#src/app/user/enums/user-role.enum.js'
import { timestamps } from '#src/sql/timestamps.js'

export const userTable = pgTable('user', {
  uuid: uuid()
    .$type<UserUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  githubUserId: varchar('github_user_id', { length: 255 }).unique().notNull(),
  githubLogin: varchar('github_login', { length: 255 }).notNull(),
  // No DB-level default: Postgres cannot use a freshly-added enum value in the
  // transaction that added it, and Drizzle runs every pending migration in one
  // transaction — so `SET DEFAULT 'guest'` would fail on any existing install
  // (it only passes on a fresh DB, where the type is created in the same
  // transaction). Role is always set explicitly; a missing one is a NOT NULL error.
  role: userRoleEnum().notNull(),
  ...timestamps,
})

export type User = typeof userTable.$inferSelect
export type NewUser = typeof userTable.$inferInsert
