import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { AppDomain } from '#src/app/app-management/entities/app-domain.types.js'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const appTable = pgTable(
  'app',
  {
    uuid: uuid()
      .$type<AppUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    environmentUuid: uuid('environment_uuid')
      .$type<EnvironmentUuid>()
      .notNull()
      .references(() => environmentTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
    slug: varchar({ length: 255 }).unique().notNull(),
    domain: jsonb().$type<AppDomain>().notNull(),
    image: varchar({ length: 255 }),
    containerPort: integer('container_port').notNull(),
    minReplicas: integer('min_replicas').notNull().default(1),
    maxReplicas: integer('max_replicas').notNull().default(1),
    env: jsonb().$type<Record<string, string>>().notNull().default({}),
    nodePin: jsonb('node_pin').$type<NodePin>(),
    source: jsonb().$type<AppSource>(),
    imagePullCredentialsEnc: text('image_pull_credentials_enc'),
    ...timestamps,
  },
  (table) => [
    // The push webhook finds apps by the repo and branch they build from.
    index('app_source_repo_branch_idx').on(
      sql`(${table.source}->>'repo')`,
      sql`(${table.source}->>'branch')`,
    ),
    // A source app has no image until its first build succeeds; any other app needs one.
    check(
      'app_image_or_source_check',
      sql`${table.image} IS NOT NULL OR ${table.source} IS NOT NULL`,
    ),
  ],
)

export type App = typeof appTable.$inferSelect
export type NewApp = typeof appTable.$inferInsert
