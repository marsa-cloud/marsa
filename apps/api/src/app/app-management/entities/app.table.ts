import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { AppDomain } from '#src/app/app-management/entities/app-domain.types.js'
import { timestamps } from '#src/sql/timestamps.js'

export const appTable = pgTable('app', {
  uuid: uuid()
    .$type<AppUuid>()
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  slug: varchar({ length: 255 }).unique().notNull(),
  domain: jsonb().$type<AppDomain>().notNull(),
  image: varchar({ length: 255 }).notNull(),
  containerPort: integer('container_port').notNull(),
  replicas: integer().notNull().default(1),
  env: jsonb().$type<Record<string, string>>().notNull().default({}),
  imagePullCredentialsEnc: text('image_pull_credentials_enc'),
  ...timestamps,
})

export type App = typeof appTable.$inferSelect
export type NewApp = typeof appTable.$inferInsert
