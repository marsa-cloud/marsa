import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole, userRoleEnum } from '#src/app/user/enums/user-role.enum.js'
import { timestamps } from '#src/sql/timestamps.js'

export const userTable = pgTable('user', {
  uuid: uuid()
    .$type<UserUuid>()
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  githubUserId: varchar('github_user_id', { length: 255 }).unique().notNull(),
  githubLogin: varchar('github_login', { length: 255 }).notNull(),
  role: userRoleEnum().notNull().default(UserRole.Member),
  ...timestamps,
})

export type User = typeof userTable.$inferSelect
export type NewUser = typeof userTable.$inferInsert
