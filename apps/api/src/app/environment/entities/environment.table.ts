import { sql } from 'drizzle-orm'
import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import {
  ENVIRONMENT_NAME_MAX_LENGTH,
  ENVIRONMENT_SLUG_MAX_LENGTH,
} from '#src/app/environment/entities/environment-config.constants.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const environmentTable = pgTable(
  'environment',
  {
    uuid: uuid()
      .$type<EnvironmentUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    projectUuid: uuid('project_uuid')
      .$type<ProjectUuid>()
      .notNull()
      .references(() => projectTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
    name: varchar({ length: ENVIRONMENT_NAME_MAX_LENGTH }).notNull(),
    slug: varchar({ length: ENVIRONMENT_SLUG_MAX_LENGTH }).notNull(),
    ...timestamps,
  },
  (table) => [unique('environment_project_uuid_slug_unique').on(table.projectUuid, table.slug)],
)

export type Environment = typeof environmentTable.$inferSelect
export type NewEnvironment = typeof environmentTable.$inferInsert
