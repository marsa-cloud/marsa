import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_SLUG_MAX_LENGTH,
} from '#src/app/project/entities/project-config.constants.js'
import { timestamps } from '#src/sql/timestamps.js'

export const projectTable = pgTable('project', {
  uuid: uuid()
    .$type<ProjectUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  name: varchar({ length: PROJECT_NAME_MAX_LENGTH }).notNull(),
  slug: varchar({ length: PROJECT_SLUG_MAX_LENGTH }).unique().notNull(),
  ...timestamps,
})

export type Project = typeof projectTable.$inferSelect
export type NewProject = typeof projectTable.$inferInsert
