import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { DeployStatus, deployStatusEnum } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger, releaseTriggerEnum } from '#src/app/release/enums/release-trigger.enum.js'
import { timestamps } from '#src/sql/timestamps.js'

export const releaseTable = pgTable('release', {
  uuid: uuid()
    .$type<ReleaseUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  appUuid: uuid('app_uuid')
    .$type<AppUuid>()
    .notNull()
    .references(() => appTable.uuid, { onUpdate: 'cascade' }),
  imageRef: varchar('image_ref', { length: 255 }).notNull(),
  triggeredBy: releaseTriggerEnum('triggered_by').notNull().default(ReleaseTrigger.Manual),
  deployStatus: deployStatusEnum('deploy_status').notNull().default(DeployStatus.Pending),
  ...timestamps,
})

export type Release = typeof releaseTable.$inferSelect
export type NewRelease = typeof releaseTable.$inferInsert
