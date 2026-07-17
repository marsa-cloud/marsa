# Reusable BE Pagination Primitives (offset + keyset)

- **Ticket:** [marsa-cloud/marsa#132](https://github.com/marsa-cloud/marsa/issues/132) — `[Refactor] Add pagination (offset, keyset)`
- **Date:** 2026-07-16
- **Scope of this PR:** the reusable primitives + their unit tests **only**. Purely additive — no endpoint changes, no contract change, CI stays green, BE-only.
- **Explicitly out of scope (follow-up ticket):** migrating `list-apps` end-to-end (BE use-case, regenerated `openapi.json`, regenerated web types, web consumer fix in `pages/apps/index.vue` + `composables/useAppList.ts`, e2e). That is a _breaking_ contract change (`{ apps }` → `{ items, meta }`) and must be coordinated across `apps/api` + `apps/web` in its own PR.

## Problem

Endpoints that return lists (starting with `deployments/apps`) currently return an unbounded array (`ListAppsRepository.listApps()` → `findAll`). We need reusable pagination building blocks — **Query** DTOs and **Response** DTOs — for both **offset** and **keyset** styles, composable with **filter / search / sort** on a per-use-case basis.

## Design principle: ORM-agnostic DTOs, isolated ORM execution

The ORM may move from MikroORM to Drizzle "soonish". Therefore the primitives are **pure, ORM-agnostic DTOs + pure helpers** — no `@mikro-orm/*` imports anywhere in `src/utils/pagination/`. The only ORM-coupled step (translating a keyset cursor into a `WHERE` clause, or calling `findAndCount`) lands **in the adopting use-case's repository** at adoption time, keeping the Drizzle-swap surface tiny.

## Layout — `src/utils/pagination/`

```
src/utils/pagination/
  pagination.constants.ts            # DEFAULT_LIMIT=20, MIN_LIMIT=1, MAX_LIMIT=100, DEFAULT_OFFSET=0
  search/
    sort-direction.ts                # enum SortDirection { ASC='asc', DESC='desc' } + SortDirectionApiProperty factory
    sort.query.ts                    # abstract SortQuery { key; order: SortDirection }
    filter.query.ts                  # abstract class FilterQuery {} — marker base for per-use-case filter shapes
    search.query.ts                  # abstract SearchQuery { sort?; filter?; search? }
  offset/
    paginated-offset.query.ts        # PaginatedOffsetQuery { limit; offset }
    paginated-offset-search.query.ts # abstract PaginatedOffsetSearchQuery extends SearchQuery { pagination: PaginatedOffsetQuery }
    paginated-offset-response-meta.ts# PaginatedOffsetResponseMeta { total; offset; limit } (+ constructor)
    paginated-offset.response.ts     # PaginatedOffsetResponse<T> { items: T[]; meta } (+ constructor)
    tests/
  keyset/
    paginated-keyset.query.ts        # PaginatedKeysetQuery { limit; cursor? }
    paginated-keyset-search.query.ts # abstract PaginatedKeysetSearchQuery extends SearchQuery { pagination: PaginatedKeysetQuery }
    paginated-keyset-response-meta.ts# PaginatedKeysetResponseMeta { nextCursor; hasMore; limit } (+ constructor)
    paginated-keyset.response.ts     # PaginatedKeysetResponse<T> { items: T[]; meta } (+ constructor)
    cursor.ts                        # encodeCursor / decodeCursor — opaque base64url(JSON), decode throws BadRequest on malformed
    keyset-comparison.ts             # pure ORM-agnostic descriptor: (sort, decodedCursor) → { field, order, value, tiebreaker }
    tests/
```

## The two reuse mechanisms

### Query — extend a base class, add filter/search/sort

Nested query objects deserialize correctly here because the Fastify adapter uses the **`qs`** querystring parser (`src/entrypoints/api.ts`). So
`?pagination[limit]=20&pagination[offset]=0&sort[key]=createdAt&sort[order]=desc&search=foo`
maps to nested DTOs. Every nested prop carries `@ValidateNested()` + `@Type(() => ...)` so the global `ValidationPipe` (`whitelist`, `transform`, `forbidNonWhitelisted`) validates through the nesting. Numeric params carry `@Type(() => Number)` (the pipe has `transform` but **not** `enableImplicitConversion`).

```ts
// A future use-case (illustrative — NOT built this PR):
class ListAppsSort extends SortQuery {
  @ApiPropertyOptional({ enum: ['createdAt', 'slug'] }) @IsIn(['createdAt', 'slug']) key:
    | 'createdAt'
    | 'slug' = 'createdAt'
  @SortDirectionApiProperty() @IsEnum(SortDirection) order: SortDirection = SortDirection.DESC
}
class ListAppsQuery extends PaginatedOffsetSearchQuery {
  @ValidateNested() @Type(() => ListAppsSort) sort?: ListAppsSort
  @IsOptional() @IsString() search?: string // repo turns into { slug: { $ilike: `%${search}%` } }
}
```

### Response — generic class, concrete at adoption

`PaginatedOffsetResponse<T>` is a clean TS model. TS erases `T` at runtime, so `@nestjs/swagger` cannot name the `items` schema from the generic alone — **but that only matters when an endpoint adopts it.** At adoption, the concrete response redeclares `items` with an explicit decorator so OpenAPI gets a named schema:

```ts
// follow-up PR, illustrative:
class ListAppsResponse extends PaginatedOffsetResponse<AppSummary> {
  @ApiProperty({ type: [AppSummary] }) declare readonly items: AppSummary[]
}
```

This PR ships only the generic base; no endpoint uses it, so there is zero OpenAPI impact now.

## The search layer (composable filter / search / sort)

```ts
export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}
export const SortDirectionApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: SortDirection, enumName: 'SortDirection' })

export abstract class SortQuery {
  // use-case narrows `key` to its sortable columns
  abstract key: string
  abstract order: SortDirection
}

export abstract class FilterQuery {} // class (not interface) so class-transformer can nest it + stay lint-clean

export abstract class SearchQuery {
  // members OPTIONAL so an endpoint opts into only what it needs
  abstract sort?: SortQuery
  abstract filter?: FilterQuery
  abstract search?: string
}
```

**Refinement vs the original sketch (flagged):** `SearchQuery`'s members are **optional**, not mandatory-abstract. An endpoint that needs pagination + search but no filter/sort shouldn't be forced to define empty `filter`/`sort` classes. `FilterQuery` is an **abstract class**, not an empty `interface` — an empty interface trips `@typescript-eslint/no-empty-object-type`, and class-transformer's `@Type()` nesting needs a class anyway.

## Offset specifics

- Params: **`offset` + `limit`** (page is derivable as `offset/limit + 1`; the primitive stays honest).
- `PaginatedOffsetQuery`: `limit` (default 20, `@Min(1)` `@Max(100)`), `offset` (default 0, `@Min(0)`), both `@IsInt` `@IsOptional` `@Type(() => Number)`.
- Meta: `{ total, offset, limit }`.
- Execution (at adoption, in the repo): `repo.findAndCount(where, { limit, offset, orderBy })` — one call gives rows + `total`.

## Keyset specifics

- UUIDs here are **v4** (`randomUUID()`) — random, _not_ time-sortable — so keyset uses a **compound key**: a sort column (e.g. `createdAt`) + `uuid` as the unique tiebreaker.
- `PaginatedKeysetQuery`: `limit` (default 20, 1–100), `cursor?` (opaque string, `@IsOptional` `@IsString`).
- **Cursor** = `base64url(JSON)` of the last row's compound key, e.g. `{ createdAt, uuid }`. Opaque — clients treat it as a token. `decodeCursor` throws `BadRequestException` on malformed input.
- `keyset-comparison.ts` (pure, ORM-agnostic) turns `(sort, decodedCursor)` into a normalized descriptor `{ field, order, value, tiebreaker: { field, value } }` capturing the semantics
  `field <order> value OR (field = value AND tiebreaker.field <order> tiebreaker.value)`.
  The adopting repo translates that descriptor into the ORM's `WHERE` (MikroORM `$or`, or Drizzle later) — the one ORM-coupled line.
- Meta: `{ nextCursor, hasMore, limit }`. Over-fetch `limit + 1` rows at adoption to compute `hasMore`; `nextCursor = hasMore ? encodeCursor(lastKeptRow) : null`.

## Testing (this PR)

Node built-in runner, `.unit.test.ts`, against compiled `dist/`. The **pure logic** is the unit-test target — no HTTP, no endpoint:

- `cursor.ts`: encode → decode round-trip; malformed / non-base64 / wrong-shape token → `BadRequestException`.
- `keyset-comparison.ts`: ASC and DESC descriptors; tiebreaker wiring; correct comparison operator per direction.
- Meta constructors: `PaginatedOffsetResponseMeta`, `PaginatedKeysetResponseMeta` field mapping.
- Query DTO defaults: `new PaginatedOffsetQuery()` → `{ limit: 20, offset: 0 }`; `new PaginatedKeysetQuery()` → `{ limit: 20 }`.
- Response constructors: `new PaginatedOffsetResponse(items, meta)` / keyset equivalent wire `items` + `meta`.
- **De-risking the no-consumer abstraction (per the noted caution):** one test seeds N real `App` rows via `AppBuilder` + a real forked `EntityManager`, slices them with `offset`/`limit` + `orderBy`, and asserts the offset primitive's meta (`total`, `offset`, `limit`) and page contents match — validating the shape against a real entity + real query even though no endpoint adopts it yet. Same for a keyset slice (assert stability across a mid-scan insert using the descriptor + cursor).

### Coverage gate

The api gate is **80% lines / 80% branches / 90% functions** (`--experimental-test-coverage`). New concrete classes contribute constructors (functions) and lines; the unit tests above instantiate every concrete DTO/meta/response + exercise both cursor/comparison helpers so the new files don't drag coverage under the floor. Abstract classes (`SortQuery`, `FilterQuery`, `SearchQuery`, the abstract `*SearchQuery`) are never instantiated → no coverage owed.

## Conventions honored

- `#src/*` subpath imports with `.js` extensions; import ordering per `simple-import-sort`; blank line after imports.
- Explicit `@ApiProperty` on every concrete DTO field (SWC ignores the swagger CLI plugin); enum exposed via a co-located `SortDirectionApiProperty` factory (mirrors the existing `DeployStatusApiProperty` pattern).
- Magic values (`DEFAULT_LIMIT`, `MAX_LIMIT`, …) in a `pagination.constants.ts`, per the "magic values live in a `.constant(s).ts`" handbook.
- `run pnpm format` before commit (`format:check` is a separate CI step).

## Risks / notes

- **No live consumer** → the abstraction could drift from real endpoint needs. Mitigated by the real-entity/real-EM tests above; fully closed when `list-apps` adopts it in the follow-up.
- **Keyset WHERE translation is not reused this PR** — it lands per-repo at adoption. Deliberate: keeps the ORM-swap surface minimal given the possible Drizzle move. The hard _logic_ (compound comparison) is still centralized + tested in `keyset-comparison.ts`; only the ORM syntax is per-repo.
