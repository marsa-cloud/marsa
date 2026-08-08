---
paths:
  - 'apps/api/src/**/*.table.ts'
  - 'apps/api/src/**/*.enum.ts'
  - 'apps/api/src/sql/**/*.ts'
---

# Drizzle tables, enums, and migrations

ORM is **Drizzle** (`drizzle-orm/node-postgres`). Config: `apps/api/drizzle.config.ts`.
Schema barrel: `src/sql/schema.ts`. Relations: `src/sql/relations.ts`.

## Name multi-word columns explicitly

```ts
// WRONG — emits a camelCase column "containerPort"
containerPort: integer().notNull()

// RIGHT
containerPort: integer('container_port').notNull()
```

Why: Drizzle uses the object key verbatim as the column name unless you pass one.
Single-word keys (`slug`, `image`, `replicas`) are already snake_case and need nothing;
every multi-word key does.

## Name the primary key `uuid`, brand it, default to uuidv7

```ts
// WRONG
id: uuid().primaryKey().defaultRandom()

// RIGHT
uuid: uuid()
  .$type<AppUuid>()
  .primaryKey()
  .default(sql`uuidv7()`)
```

Why: the brand (`AppUuid = Uuid<'App'>`) makes it a type error to pass an `AppUuid`
where a `ReleaseUuid` is expected. `uuidv7()` is time-ordered, which is what lets the
primary key double as a pagination cursor.

## Spread the shared timestamps

```ts
// WRONG
createdAt: timestamp('created_at').defaultNow().notNull()

// RIGHT
...timestamps
```

Why: `src/sql/timestamps.ts` also wires `$onUpdate` on `updatedAt`. Hand-rolling the
column silently drops that, so `updated_at` freezes at insert time.

## Point foreign keys at the parent's `uuid`, named `<parent>_uuid`

```ts
// RIGHT
appUuid: uuid('app_uuid')
  .$type<AppUuid>()
  .notNull()
  .references(() => appTable.uuid, { onUpdate: 'cascade' })
```

## Re-export every table and pg enum from `src/sql/schema.ts`

```ts
// src/sql/schema.ts
export * from '#src/app/app-management/entities/app.table.js'
export { deployStatusEnum } from '#src/app/release/enums/deploy-status.enum.js'
```

Why: drizzle-kit reads **only** that barrel. A table missing from it produces no
migration — `db:generate` succeeds and silently emits nothing for it.

## Declare relations centrally, not on the table

Relations go in `src/sql/relations.ts` via `defineRelations`, which is what makes
`db.query.releaseTable.findMany({ where: { app: { slug } } })` work. Tables stay free of
relation config.

## Derive row types, never hand-write them

```ts
// RIGHT
export type App = typeof appTable.$inferSelect
export type NewApp = typeof appTable.$inferInsert
```

## Export a pg enum and its Swagger decorator from the same file

```ts
export enum DeployStatus {
  Pending = 'pending' /* … */,
}

export const deployStatusEnum = pgEnum('deploy_status_enum', DeployStatus)

export const DeployStatusApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: DeployStatus, enumName: 'DeployStatus' })
```

Why: keeping the `enum` + `enumName` pair defined once stops them drifting. See
`.claude/rules/api/response-dto.md` for why a missing `enumName` breaks the web types.

## Migrations

- Generate: `pnpm --filter api db:generate` (drizzle-kit) after any table change.
- **Never hand-edit generated SQL** under `src/sql/drizzle/`.
- Applied by `migrate()` in `DatabaseModule.onModuleInit` **only when `NODE_ENV=production`**;
  tests apply them from `src/test/setup/global-setup.ts`, which drops both the `public`
  and `drizzle` schemas first.
