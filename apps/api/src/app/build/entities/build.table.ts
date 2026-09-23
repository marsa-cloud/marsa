import { sql } from 'drizzle-orm'
import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus, buildStatusEnum } from '#src/app/build/enums/build-status.enum.js'
import { buildTriggerEnum } from '#src/app/build/enums/build-trigger.enum.js'
import { timestamps } from '#src/sql/timestamps.js'

export const buildTable = pgTable(
  'build',
  {
    uuid: uuid()
      .$type<BuildUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    appUuid: uuid('app_uuid')
      .$type<AppUuid>()
      .notNull()
      .references(() => appTable.uuid, { onUpdate: 'cascade' }),
    commitSha: varchar('commit_sha', { length: 40 }).notNull(),
    branch: varchar({ length: 255 }).notNull(),
    status: buildStatusEnum().notNull().default(BuildStatus.Running),
    trigger: buildTriggerEnum().notNull(),
    imageRef: varchar('image_ref', { length: 255 }),
    failureReason: text('failure_reason'),
    ...timestamps,
  },
  (table) => [
    index('build_app_uuid_idx').on(table.appUuid, table.uuid.desc()),
    // The sweeper only ever reads running builds.
    index('build_running_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'running'`),
  ],
)

export type Build = typeof buildTable.$inferSelect
export type NewBuild = typeof buildTable.$inferInsert
