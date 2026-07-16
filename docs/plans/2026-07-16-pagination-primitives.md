# BE Pagination Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship reusable, ORM-agnostic offset + keyset pagination primitives (Query + Response DTOs, cursor codec, keyset-comparison descriptor) under `apps/api/src/utils/pagination/`, with unit tests plus two DB-backed tests that exercise them against a real `App` entity.

**Architecture:** Pure DTOs and pure helpers — zero `@mikro-orm/*` imports in the shipped `src/utils/pagination/**` source. The single ORM-coupled step (translating a keyset descriptor into a `WHERE`) is demonstrated only inside a `.db.test.ts`, mirroring how an adopting repository will write it. Nested query DTOs (`pagination[...]`, `sort[...]`) rely on the Fastify `qs` querystring parser already configured in this app. No endpoint is migrated in this PR — it is purely additive, so `openapi.json` does not change.

**Tech Stack:** NestJS 11 (Fastify), MikroORM v6, `@nestjs/swagger` (explicit `@ApiProperty`, SWC build — no CLI plugin), `class-validator` / `class-transformer`, `node:test` + `expect`.

## Global Constraints

- **Imports:** subpath imports only (`#src/*`), always with `.js` extension; no relative imports. Order: side-effects → `node:` → packages → `#src/*` → `#test/*`. Blank line after the last import. Run `pnpm --filter api lint:fix` to normalise intra-group order.
- **Every concrete DTO field carries an explicit `@ApiProperty` / `@ApiPropertyOptional`** (SWC ignores the swagger CLI plugin). Enums use a co-located `*ApiProperty` factory.
- **Query numbers need `@Type(() => Number)`** — the global `ValidationPipe` has `transform` but NOT `enableImplicitConversion`.
- **Coverage floors (whole api suite):** lines ≥ 80, branches ≥ 75, functions ≥ 75. Do not lower them.
- **Format:** run `pnpm --filter api format` (or root `pnpm format`) before every commit — `format:check` is a separate CI step and prettier is not wired into ESLint.
- **Commits:** conventional format `type: subject`; reference the ticket with `Refs #132` (NOT `Closes` — the endpoint work that resolves #132 comes later). End every commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Never `git add -A`/`.`** — stage explicit paths.
- **Paths in this plan are relative to the api package** `apps/api/` unless stated. Work happens in the worktree `workspace/marsa/.worktrees/refactor__132-pagination-primitives` on branch `refactor/132-pagination-primitives`.

---

### Task 0: Prerequisites (one-time, in the worktree)

**Files:** none (environment only).

- [ ] **Step 1: Install deps + start Postgres + baseline green**

Run from the worktree root (`workspace/marsa/.worktrees/refactor__132-pagination-primitives`):

```bash
pnpm install
docker compose up -d                 # postgres:17, db marsa_test on :5432
pnpm --filter api build
pnpm --filter api test               # full baseline suite must pass before we start
```

Expected: install completes, Postgres is up, the existing suite passes (green baseline). If the baseline is red, stop and report — do not build on a red baseline.

---

### Task 1: Constants + search/sort scaffolding

**Files:**
- Create: `src/utils/pagination/pagination.constants.ts`
- Create: `src/utils/pagination/search/sort-direction.ts`
- Create: `src/utils/pagination/search/sort.query.ts`
- Create: `src/utils/pagination/search/filter.query.ts`
- Create: `src/utils/pagination/search/search.query.ts`
- Test: `src/utils/pagination/search/tests/search-layer.unit.test.ts`

**Interfaces:**
- Produces: `DEFAULT_LIMIT`, `MIN_LIMIT`, `MAX_LIMIT`, `DEFAULT_OFFSET` (numbers); `enum SortDirection { ASC='asc', DESC='desc' }`; `SortDirectionApiProperty(options?): PropertyDecorator`; `abstract class SortQuery { abstract key: string; abstract order: SortDirection }`; `abstract class FilterQuery {}`; `abstract class SearchQuery { sort?: SortQuery; filter?: FilterQuery; search?: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pagination/search/tests/search-layer.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { TestBench } from '#src/test/setup/test-bench.js'
import { DEFAULT_LIMIT, MAX_LIMIT, MIN_LIMIT } from '#src/utils/pagination/pagination.constants.js'
import { SortQuery } from '#src/utils/pagination/search/sort.query.js'
import {
  SortDirection,
  SortDirectionApiProperty,
} from '#src/utils/pagination/search/sort-direction.js'

class TestSort extends SortQuery {
  key = 'createdAt'
  order = SortDirection.DESC
}

describe('pagination search layer', () => {
  before(() => TestBench.setupUnitTest())

  it('exposes asc/desc string enum values', () => {
    expect(SortDirection.ASC).toBe('asc')
    expect(SortDirection.DESC).toBe('desc')
  })

  it('SortDirectionApiProperty returns a property decorator', () => {
    expect(typeof SortDirectionApiProperty()).toBe('function')
  })

  it('a concrete SortQuery carries key + order', () => {
    const sort = new TestSort()
    expect(sort.key).toBe('createdAt')
    expect(sort.order).toBe(SortDirection.DESC)
  })

  it('has sane limit bounds', () => {
    expect(MIN_LIMIT).toBeLessThan(DEFAULT_LIMIT)
    expect(DEFAULT_LIMIT).toBeLessThanOrEqual(MAX_LIMIT)
  })
})
```

- [ ] **Step 2: Build + run to verify it fails**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/search/tests/search-layer.unit.test.js"
```

Expected: FAIL — build emits the test but the run errors with `ERR_MODULE_NOT_FOUND` for `pagination.constants.js` / `sort-direction.js` (source not created yet). (If `nest build` skips emitting the test because imports resolve to nothing, that missing-module error is the red state.)

- [ ] **Step 3: Create the source files**

`src/utils/pagination/pagination.constants.ts`:

```ts
export const DEFAULT_LIMIT = 20
export const MIN_LIMIT = 1
export const MAX_LIMIT = 100
export const DEFAULT_OFFSET = 0
```

`src/utils/pagination/search/sort-direction.ts`:

```ts
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export const SortDirectionApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: SortDirection, enumName: 'SortDirection' })
```

`src/utils/pagination/search/sort.query.ts`:

```ts
import { type SortDirection } from '#src/utils/pagination/search/sort-direction.js'

// Base for a use-case's sort DTO. The use-case narrows `key` to a union/enum of
// its sortable columns and decorates both fields (@ApiProperty + validators).
export abstract class SortQuery {
  abstract key: string
  abstract order: SortDirection
}
```

`src/utils/pagination/search/filter.query.ts`:

```ts
// Marker base for a use-case's filter DTO. Empty on purpose — each use-case
// defines its own filter fields. A class (not an interface) so class-transformer
// can nest it via @Type() and so it avoids the empty-interface lint rule.
export abstract class FilterQuery {}
```

`src/utils/pagination/search/search.query.ts`:

```ts
import { type FilterQuery } from '#src/utils/pagination/search/filter.query.js'
import { type SortQuery } from '#src/utils/pagination/search/sort.query.js'

// Composable search surface. Members are optional so a use-case opts into only
// what it needs; it redeclares each used field with a concrete type +
// @ValidateNested()/@Type().
export abstract class SearchQuery {
  sort?: SortQuery
  filter?: FilterQuery
  search?: string
}
```

- [ ] **Step 4: Build + run to verify it passes**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/search/tests/search-layer.unit.test.js"
```

Expected: PASS (4 tests).

- [ ] **Step 5: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/pagination.constants.ts \
        apps/api/src/utils/pagination/search/sort-direction.ts \
        apps/api/src/utils/pagination/search/sort.query.ts \
        apps/api/src/utils/pagination/search/filter.query.ts \
        apps/api/src/utils/pagination/search/search.query.ts \
        apps/api/src/utils/pagination/search/tests/search-layer.unit.test.ts
git commit -F - <<'EOF'
feat: add pagination constants + search/sort scaffolding

- DEFAULT/MIN/MAX limit + offset constants
- SortDirection enum + SortDirectionApiProperty factory
- Abstract SortQuery / FilterQuery / SearchQuery bases (composable filter/search/sort)

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

Expected: lint/typecheck clean, commit created. If lint flags the empty `FilterQuery` class (`no-extraneous-class`, unlikely — not in this repo's config), add `// eslint-disable-next-line @typescript-eslint/no-extraneous-class` above the class rather than changing it to an interface (class-transformer nesting needs a class).

---

### Task 2: Offset query DTOs

**Files:**
- Create: `src/utils/pagination/offset/paginated-offset.query.ts`
- Create: `src/utils/pagination/offset/paginated-offset-search.query.ts`
- Test: `src/utils/pagination/offset/tests/paginated-offset-query.unit.test.ts`

**Interfaces:**
- Consumes: constants from Task 1; `SearchQuery` from Task 1.
- Produces: `class PaginatedOffsetQuery { limit: number; offset: number }` (defaults 20 / 0); `abstract class PaginatedOffsetSearchQuery extends SearchQuery { pagination: PaginatedOffsetQuery }` (pagination defaults to `new PaginatedOffsetQuery()`).

- [ ] **Step 1: Write the failing test**

Create `src/utils/pagination/offset/tests/paginated-offset-query.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedOffsetSearchQuery } from '#src/utils/pagination/offset/paginated-offset-search.query.js'
import { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'

class TestOffsetSearch extends PaginatedOffsetSearchQuery {}

describe('offset pagination query DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('defaults to limit 20, offset 0', () => {
    const q = new PaginatedOffsetQuery()
    expect(q.limit).toBe(20)
    expect(q.offset).toBe(0)
  })

  it('search query defaults pagination and leaves sort/filter/search unset', () => {
    const q = new TestOffsetSearch()
    expect(q.pagination.limit).toBe(20)
    expect(q.pagination.offset).toBe(0)
    expect(q.sort).toBeUndefined()
    expect(q.filter).toBeUndefined()
    expect(q.search).toBeUndefined()
  })
})
```

- [ ] **Step 2: Build + run to verify it fails**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/offset/tests/paginated-offset-query.unit.test.js"
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for the offset query modules.

- [ ] **Step 3: Create the source files**

`src/utils/pagination/offset/paginated-offset.query.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

import {
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  MAX_LIMIT,
  MIN_LIMIT,
} from '#src/utils/pagination/pagination.constants.js'

export class PaginatedOffsetQuery {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: MIN_LIMIT,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LIMIT)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT

  @ApiPropertyOptional({ type: 'integer', minimum: 0, default: DEFAULT_OFFSET })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = DEFAULT_OFFSET
}
```

`src/utils/pagination/offset/paginated-offset-search.query.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'

import { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'
import { SearchQuery } from '#src/utils/pagination/search/search.query.js'

// Offset pagination + the composable search surface. A use-case extends this and
// redeclares whichever of sort / filter / search it needs.
export abstract class PaginatedOffsetSearchQuery extends SearchQuery {
  @ApiPropertyOptional({ type: PaginatedOffsetQuery })
  @ValidateNested()
  @Type(() => PaginatedOffsetQuery)
  pagination: PaginatedOffsetQuery = new PaginatedOffsetQuery()
}
```

- [ ] **Step 4: Build + run to verify it passes**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/offset/tests/paginated-offset-query.unit.test.js"
```

Expected: PASS (2 tests).

- [ ] **Step 5: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/offset/paginated-offset.query.ts \
        apps/api/src/utils/pagination/offset/paginated-offset-search.query.ts \
        apps/api/src/utils/pagination/offset/tests/paginated-offset-query.unit.test.ts
git commit -F - <<'EOF'
feat: add offset pagination query DTOs

- PaginatedOffsetQuery { limit, offset } with validation + defaults
- PaginatedOffsetSearchQuery layering pagination onto SearchQuery

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Offset response DTOs

**Files:**
- Create: `src/utils/pagination/offset/paginated-offset-response-meta.ts`
- Create: `src/utils/pagination/offset/paginated-offset.response.ts`
- Test: `src/utils/pagination/offset/tests/paginated-offset-response.unit.test.ts`

**Interfaces:**
- Produces: `class PaginatedOffsetResponseMeta { readonly total; readonly offset; readonly limit; constructor(total, offset, limit) }`; `class PaginatedOffsetResponse<T> { readonly items: T[]; readonly meta: PaginatedOffsetResponseMeta; constructor(items, meta) }`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pagination/offset/tests/paginated-offset-response.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedOffsetResponseMeta } from '#src/utils/pagination/offset/paginated-offset-response-meta.js'
import { PaginatedOffsetResponse } from '#src/utils/pagination/offset/paginated-offset.response.js'

describe('offset pagination response DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('meta captures total/offset/limit', () => {
    const meta = new PaginatedOffsetResponseMeta(42, 20, 10)
    expect(meta.total).toBe(42)
    expect(meta.offset).toBe(20)
    expect(meta.limit).toBe(10)
  })

  it('response wraps items + meta', () => {
    const meta = new PaginatedOffsetResponseMeta(1, 0, 10)
    const res = new PaginatedOffsetResponse<string>(['a'], meta)
    expect(res.items).toEqual(['a'])
    expect(res.meta).toBe(meta)
  })
})
```

- [ ] **Step 2: Build + run to verify it fails**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/offset/tests/paginated-offset-response.unit.test.js"
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for the response modules.

- [ ] **Step 3: Create the source files**

`src/utils/pagination/offset/paginated-offset-response-meta.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'

export class PaginatedOffsetResponseMeta {
  @ApiProperty({ type: 'integer', description: 'Total rows matching the query, ignoring limit/offset.' })
  readonly total: number

  @ApiProperty({ type: 'integer', description: 'Offset applied to this page.' })
  readonly offset: number

  @ApiProperty({ type: 'integer', description: 'Limit applied to this page.' })
  readonly limit: number

  constructor(total: number, offset: number, limit: number) {
    this.total = total
    this.offset = offset
    this.limit = limit
  }
}
```

`src/utils/pagination/offset/paginated-offset.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'

import { PaginatedOffsetResponseMeta } from '#src/utils/pagination/offset/paginated-offset-response-meta.js'

// Generic offset page. `T` is erased at runtime, so an adopting use-case
// subclasses this and redeclares `items` with `@ApiProperty({ type: [ItemDto] })`
// to give OpenAPI a named item schema.
export class PaginatedOffsetResponse<T> {
  readonly items: T[]

  @ApiProperty({ type: PaginatedOffsetResponseMeta })
  readonly meta: PaginatedOffsetResponseMeta

  constructor(items: T[], meta: PaginatedOffsetResponseMeta) {
    this.items = items
    this.meta = meta
  }
}
```

- [ ] **Step 4: Build + run to verify it passes**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/offset/tests/paginated-offset-response.unit.test.js"
```

Expected: PASS (2 tests).

- [ ] **Step 5: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/offset/paginated-offset-response-meta.ts \
        apps/api/src/utils/pagination/offset/paginated-offset.response.ts \
        apps/api/src/utils/pagination/offset/tests/paginated-offset-response.unit.test.ts
git commit -F - <<'EOF'
feat: add offset pagination response DTOs

- PaginatedOffsetResponseMeta { total, offset, limit }
- Generic PaginatedOffsetResponse<T> { items, meta }

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Offset DB-backed test (de-risk the no-consumer abstraction)

**Files:**
- Test: `src/utils/pagination/offset/tests/paginated-offset.db.test.ts`

**Interfaces:**
- Consumes: `PaginatedOffsetResponseMeta` (Task 3); `App` + `AppBuilder` + `DeploymentsModule` (existing); `TestBench.setupModuleTest` + `TestSetup` (existing).

- [ ] **Step 1: Write the test (this is the deliverable — it must pass once written; source already exists)**

Create `src/utils/pagination/offset/tests/paginated-offset.db.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'

import { expect } from 'expect'

import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { DeploymentsModule } from '#src/app/deployments/deployments.module.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'
import { PaginatedOffsetResponseMeta } from '#src/utils/pagination/offset/paginated-offset-response-meta.js'

describe('offset pagination over a real App query (db)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupModuleTest(DeploymentsModule)
    for (let i = 0; i < 5; i++) {
      setup.entityManager.persist(new AppBuilder().withSlug(`app-${i}`).build())
    }
    await setup.entityManager.flush()
  })

  after(async () => {
    await setup.teardown()
  })

  it('slices the middle page and the meta matches findAndCount', async () => {
    const [rows, total] = await setup.entityManager.findAndCount(
      App,
      {},
      { limit: 2, offset: 2, orderBy: { slug: 'ASC' } },
    )
    const meta = new PaginatedOffsetResponseMeta(total, 2, 2)

    expect(total).toBe(5)
    expect(rows.map((a) => a.slug)).toEqual(['app-2', 'app-3'])
    expect(meta.total).toBe(5)
    expect(meta.offset).toBe(2)
    expect(meta.limit).toBe(2)
  })
})
```

- [ ] **Step 2: Build, run migrations, run the test**

```bash
docker compose up -d                 # ensure Postgres is up
pnpm --filter api build
pnpm --filter api test:setup         # applies migrations to marsa_test (creates the `app` table)
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/offset/tests/paginated-offset.db.test.js"
```

Expected: PASS (1 test). If it errors with a missing `app` table, `test:setup` did not run — re-run the migration step. `setup.teardown()` truncates all tables afterward.

- [ ] **Step 3: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/offset/tests/paginated-offset.db.test.ts
git commit -F - <<'EOF'
test: exercise offset pagination against a real App query

Seeds 5 App rows via a forked EM and asserts findAndCount slicing +
PaginatedOffsetResponseMeta match — validates the primitive against a real
entity before any endpoint adopts it.

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Keyset cursor codec

**Files:**
- Create: `src/utils/pagination/keyset/cursor.ts`
- Test: `src/utils/pagination/keyset/tests/cursor.unit.test.ts`

**Interfaces:**
- Produces: `interface CursorPayload { readonly sortValue: string | number; readonly id: string }`; `encodeCursor(payload: CursorPayload): string`; `decodeCursor(cursor: string): CursorPayload` (throws `BadRequestException` on malformed input).

- [ ] **Step 1: Write the failing test**

Create `src/utils/pagination/keyset/tests/cursor.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'

import { BadRequestException } from '@nestjs/common'
import { expect } from 'expect'

import { TestBench } from '#src/test/setup/test-bench.js'
import { decodeCursor, encodeCursor } from '#src/utils/pagination/keyset/cursor.js'

describe('keyset cursor codec', () => {
  before(() => TestBench.setupUnitTest())

  it('round-trips a string sortValue', () => {
    const token = encodeCursor({ sortValue: '2026-07-16T00:00:00.000Z', id: 'abc' })
    expect(decodeCursor(token)).toEqual({ sortValue: '2026-07-16T00:00:00.000Z', id: 'abc' })
  })

  it('round-trips a numeric sortValue', () => {
    const token = encodeCursor({ sortValue: 42, id: 'xyz' })
    expect(decodeCursor(token)).toEqual({ sortValue: 42, id: 'xyz' })
  })

  it('rejects a non-decodable token', () => {
    expect(() => decodeCursor('!!!not valid!!!')).toThrow(BadRequestException)
  })

  it('rejects well-formed JSON of the wrong shape', () => {
    const token = Buffer.from(JSON.stringify({ nope: 1 }), 'utf8').toString('base64url')
    expect(() => decodeCursor(token)).toThrow(BadRequestException)
  })
})
```

- [ ] **Step 2: Build + run to verify it fails**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/keyset/tests/cursor.unit.test.js"
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `cursor.js`.

- [ ] **Step 3: Create the source file**

`src/utils/pagination/keyset/cursor.ts`:

```ts
import { BadRequestException } from '@nestjs/common'

// The decoded contents of a keyset cursor: the sort key + unique tiebreaker of
// the last row on the previous page.
export interface CursorPayload {
  readonly sortValue: string | number
  readonly id: string
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new BadRequestException('Malformed pagination cursor.')
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('sortValue' in parsed) ||
    !('id' in parsed) ||
    typeof (parsed as CursorPayload).id !== 'string' ||
    !['string', 'number'].includes(typeof (parsed as CursorPayload).sortValue)
  ) {
    throw new BadRequestException('Malformed pagination cursor.')
  }

  return { sortValue: (parsed as CursorPayload).sortValue, id: (parsed as CursorPayload).id }
}
```

- [ ] **Step 4: Build + run to verify it passes**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/keyset/tests/cursor.unit.test.js"
```

Expected: PASS (4 tests).

- [ ] **Step 5: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/keyset/cursor.ts \
        apps/api/src/utils/pagination/keyset/tests/cursor.unit.test.ts
git commit -F - <<'EOF'
feat: add opaque keyset cursor codec

- encodeCursor/decodeCursor over base64url(JSON) of { sortValue, id }
- decode throws BadRequestException on malformed / wrong-shape input

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Keyset comparison descriptor

**Files:**
- Create: `src/utils/pagination/keyset/keyset-comparison.ts`
- Test: `src/utils/pagination/keyset/tests/keyset-comparison.unit.test.ts`

**Interfaces:**
- Consumes: `SortDirection` (Task 1); `CursorPayload` (Task 5).
- Produces: `type ComparisonOperator = '$lt' | '$gt'`; `interface KeysetComparison { readonly sortField: string; readonly idField: string; readonly operator: ComparisonOperator; readonly sortValue: string | number; readonly id: string }`; `keysetComparison(sortField: string, idField: string, order: SortDirection, cursor: CursorPayload): KeysetComparison`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pagination/keyset/tests/keyset-comparison.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { TestBench } from '#src/test/setup/test-bench.js'
import { keysetComparison } from '#src/utils/pagination/keyset/keyset-comparison.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

describe('keysetComparison', () => {
  before(() => TestBench.setupUnitTest())

  it('DESC seeks past the cursor with $lt', () => {
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.DESC, {
      sortValue: 'v',
      id: 'i',
    })
    expect(cmp).toEqual({
      sortField: 'createdAt',
      idField: 'uuid',
      operator: '$lt',
      sortValue: 'v',
      id: 'i',
    })
  })

  it('ASC seeks past the cursor with $gt', () => {
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.ASC, { sortValue: 'v', id: 'i' })
    expect(cmp.operator).toBe('$gt')
  })
})
```

- [ ] **Step 2: Build + run to verify it fails**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/keyset/tests/keyset-comparison.unit.test.js"
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `keyset-comparison.js`.

- [ ] **Step 3: Create the source file**

`src/utils/pagination/keyset/keyset-comparison.ts`:

```ts
import { type CursorPayload } from '#src/utils/pagination/keyset/cursor.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

// Which comparison operator advances past the cursor for a given sort direction.
export type ComparisonOperator = '$lt' | '$gt'

// ORM-agnostic descriptor of the keyset "seek past the cursor" predicate:
//   sortField <op> sortValue OR (sortField = sortValue AND idField <op> id)
// The adopting repository translates this into its ORM's WHERE (MikroORM $or,
// Drizzle, …), keeping the ORM-specific syntax the only thing a repo writes.
export interface KeysetComparison {
  readonly sortField: string
  readonly idField: string
  readonly operator: ComparisonOperator
  readonly sortValue: string | number
  readonly id: string
}

export function keysetComparison(
  sortField: string,
  idField: string,
  order: SortDirection,
  cursor: CursorPayload,
): KeysetComparison {
  return {
    sortField,
    idField,
    operator: order === SortDirection.ASC ? '$gt' : '$lt',
    sortValue: cursor.sortValue,
    id: cursor.id,
  }
}
```

- [ ] **Step 4: Build + run to verify it passes**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/keyset/tests/keyset-comparison.unit.test.js"
```

Expected: PASS (2 tests).

- [ ] **Step 5: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/keyset/keyset-comparison.ts \
        apps/api/src/utils/pagination/keyset/tests/keyset-comparison.unit.test.ts
git commit -F - <<'EOF'
feat: add ORM-agnostic keyset comparison descriptor

keysetComparison() maps (sortField, idField, order, cursor) to a normalized
seek-past-the-cursor descriptor; the ORM-specific WHERE is built by the
adopting repo.

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Keyset query + response DTOs

**Files:**
- Create: `src/utils/pagination/keyset/paginated-keyset.query.ts`
- Create: `src/utils/pagination/keyset/paginated-keyset-search.query.ts`
- Create: `src/utils/pagination/keyset/paginated-keyset-response-meta.ts`
- Create: `src/utils/pagination/keyset/paginated-keyset.response.ts`
- Test: `src/utils/pagination/keyset/tests/paginated-keyset.unit.test.ts`

**Interfaces:**
- Consumes: constants (Task 1); `SearchQuery` (Task 1).
- Produces: `class PaginatedKeysetQuery { limit: number; cursor?: string }` (limit default 20); `abstract class PaginatedKeysetSearchQuery extends SearchQuery { pagination: PaginatedKeysetQuery }`; `class PaginatedKeysetResponseMeta { readonly nextCursor: string | null; readonly hasMore: boolean; readonly limit: number; constructor(nextCursor, hasMore, limit) }`; `class PaginatedKeysetResponse<T> { readonly items: T[]; readonly meta: PaginatedKeysetResponseMeta; constructor(items, meta) }`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pagination/keyset/tests/paginated-keyset.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedKeysetSearchQuery } from '#src/utils/pagination/keyset/paginated-keyset-search.query.js'
import { PaginatedKeysetQuery } from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import { PaginatedKeysetResponseMeta } from '#src/utils/pagination/keyset/paginated-keyset-response-meta.js'
import { PaginatedKeysetResponse } from '#src/utils/pagination/keyset/paginated-keyset.response.js'

class TestKeysetSearch extends PaginatedKeysetSearchQuery {}

describe('keyset pagination DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('query defaults to limit 20, undefined cursor', () => {
    const q = new PaginatedKeysetQuery()
    expect(q.limit).toBe(20)
    expect(q.cursor).toBeUndefined()
  })

  it('search query defaults pagination', () => {
    const q = new TestKeysetSearch()
    expect(q.pagination.limit).toBe(20)
  })

  it('meta captures nextCursor/hasMore/limit', () => {
    const meta = new PaginatedKeysetResponseMeta('cur', true, 20)
    expect(meta.nextCursor).toBe('cur')
    expect(meta.hasMore).toBe(true)
    expect(meta.limit).toBe(20)
  })

  it('meta allows a null nextCursor', () => {
    const meta = new PaginatedKeysetResponseMeta(null, false, 20)
    expect(meta.nextCursor).toBeNull()
    expect(meta.hasMore).toBe(false)
  })

  it('response wraps items + meta', () => {
    const meta = new PaginatedKeysetResponseMeta(null, false, 20)
    const res = new PaginatedKeysetResponse<number>([1, 2], meta)
    expect(res.items).toEqual([1, 2])
    expect(res.meta).toBe(meta)
  })
})
```

- [ ] **Step 2: Build + run to verify it fails**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/keyset/tests/paginated-keyset.unit.test.js"
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for the keyset DTO modules.

- [ ] **Step 3: Create the source files**

`src/utils/pagination/keyset/paginated-keyset.query.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import { DEFAULT_LIMIT, MAX_LIMIT, MIN_LIMIT } from '#src/utils/pagination/pagination.constants.js'

export class PaginatedKeysetQuery {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: MIN_LIMIT,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LIMIT)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT

  @ApiPropertyOptional({
    type: 'string',
    description: 'Opaque cursor from a previous page’s meta.nextCursor.',
  })
  @IsOptional()
  @IsString()
  cursor?: string
}
```

`src/utils/pagination/keyset/paginated-keyset-search.query.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'

import { PaginatedKeysetQuery } from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import { SearchQuery } from '#src/utils/pagination/search/search.query.js'

export abstract class PaginatedKeysetSearchQuery extends SearchQuery {
  @ApiPropertyOptional({ type: PaginatedKeysetQuery })
  @ValidateNested()
  @Type(() => PaginatedKeysetQuery)
  pagination: PaginatedKeysetQuery = new PaginatedKeysetQuery()
}
```

`src/utils/pagination/keyset/paginated-keyset-response-meta.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'

export class PaginatedKeysetResponseMeta {
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Cursor for the next page, or null on the last page.',
  })
  readonly nextCursor: string | null

  @ApiProperty({ type: 'boolean', description: 'Whether more rows exist after this page.' })
  readonly hasMore: boolean

  @ApiProperty({ type: 'integer', description: 'Limit applied to this page.' })
  readonly limit: number

  constructor(nextCursor: string | null, hasMore: boolean, limit: number) {
    this.nextCursor = nextCursor
    this.hasMore = hasMore
    this.limit = limit
  }
}
```

`src/utils/pagination/keyset/paginated-keyset.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'

import { PaginatedKeysetResponseMeta } from '#src/utils/pagination/keyset/paginated-keyset-response-meta.js'

// Generic keyset page. `T` is erased at runtime, so an adopting use-case
// subclasses this and redeclares `items` with `@ApiProperty({ type: [ItemDto] })`.
export class PaginatedKeysetResponse<T> {
  readonly items: T[]

  @ApiProperty({ type: PaginatedKeysetResponseMeta })
  readonly meta: PaginatedKeysetResponseMeta

  constructor(items: T[], meta: PaginatedKeysetResponseMeta) {
    this.items = items
    this.meta = meta
  }
}
```

- [ ] **Step 4: Build + run to verify it passes**

```bash
pnpm --filter api build
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/keyset/tests/paginated-keyset.unit.test.js"
```

Expected: PASS (5 tests).

- [ ] **Step 5: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/keyset/paginated-keyset.query.ts \
        apps/api/src/utils/pagination/keyset/paginated-keyset-search.query.ts \
        apps/api/src/utils/pagination/keyset/paginated-keyset-response-meta.ts \
        apps/api/src/utils/pagination/keyset/paginated-keyset.response.ts \
        apps/api/src/utils/pagination/keyset/tests/paginated-keyset.unit.test.ts
git commit -F - <<'EOF'
feat: add keyset pagination query + response DTOs

- PaginatedKeysetQuery { limit, cursor? } + PaginatedKeysetSearchQuery
- PaginatedKeysetResponseMeta { nextCursor, hasMore, limit }
- Generic PaginatedKeysetResponse<T> { items, meta }

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Keyset DB-backed test (cursor + descriptor + mid-scan stability)

**Files:**
- Test: `src/utils/pagination/keyset/tests/paginated-keyset.db.test.ts`

**Interfaces:**
- Consumes: `encodeCursor`/`decodeCursor` (Task 5); `keysetComparison` + `KeysetComparison` (Task 6); `SortDirection` (Task 1); `App` + `AppBuilder` + `DeploymentsModule`; `TestBench`/`TestSetup`. Uses MikroORM's `FilterQuery` type **inside the test only** (the demonstrated adoption glue).

- [ ] **Step 1: Write the test**

Create `src/utils/pagination/keyset/tests/paginated-keyset.db.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'

import { type FilterQuery } from '@mikro-orm/core'
import { expect } from 'expect'

import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { DeploymentsModule } from '#src/app/deployments/deployments.module.js'
import { decodeCursor, encodeCursor } from '#src/utils/pagination/keyset/cursor.js'
import {
  keysetComparison,
  type KeysetComparison,
} from '#src/utils/pagination/keyset/keyset-comparison.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

// The single ORM-specific step an adopting repo writes: descriptor -> MikroORM $or.
function keysetWhere(cmp: KeysetComparison): FilterQuery<App> {
  const sortValue = new Date(cmp.sortValue as string)
  return {
    $or: [
      { [cmp.sortField]: { [cmp.operator]: sortValue } },
      { [cmp.sortField]: sortValue, [cmp.idField]: { [cmp.operator]: cmp.id } },
    ],
  } as FilterQuery<App>
}

describe('keyset pagination over a real App query (db)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupModuleTest(DeploymentsModule)
    const base = Date.now()
    for (let i = 0; i < 4; i++) {
      const app = new AppBuilder().withSlug(`app-${i}`).build()
      app.createdAt = new Date(base + i * 1000) // distinct timestamps -> deterministic DESC order
      setup.entityManager.persist(app)
    }
    await setup.entityManager.flush()
  })

  after(async () => {
    await setup.teardown()
  })

  it('advances by cursor and stays stable across a mid-scan insert', async () => {
    const em = setup.entityManager
    const limit = 2
    const orderBy = { createdAt: 'DESC', uuid: 'DESC' } as const

    // Page 1 — no cursor. Over-fetch limit+1 to detect hasMore.
    const page1 = await em.find(App, {}, { orderBy, limit: limit + 1 })
    const page1Items = page1.slice(0, limit)
    expect(page1Items.map((a) => a.slug)).toEqual(['app-3', 'app-2'])
    expect(page1.length > limit).toBe(true)

    const last = page1Items[limit - 1]
    const cursor = encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.uuid })

    // A row inserted AFTER page 1, newer than everything. Offset pagination would
    // shift page 2 and duplicate a row; keyset (seek past the cursor) must ignore it.
    const intruder = new AppBuilder().withSlug('app-intruder').build()
    intruder.createdAt = new Date(Date.now() + 10_000)
    em.persist(intruder)
    await em.flush()

    // Page 2 — seek past the cursor.
    const cmp = keysetComparison('createdAt', 'uuid', SortDirection.DESC, decodeCursor(cursor))
    const page2 = await em.find(App, keysetWhere(cmp), { orderBy, limit: limit + 1 })
    const page2Slugs = page2.slice(0, limit).map((a) => a.slug)

    expect(page2Slugs).toEqual(['app-1', 'app-0'])
    expect(page2Slugs).not.toContain('app-intruder')
    expect(page2Slugs).not.toContain('app-2')
  })
})
```

- [ ] **Step 2: Build, run migrations, run the test**

```bash
docker compose up -d
pnpm --filter api build
pnpm --filter api test:setup
node --env-file=apps/api/.env.test --test "apps/api/dist/src/utils/pagination/keyset/tests/paginated-keyset.db.test.js"
```

Expected: PASS (1 test). This proves the cursor + descriptor produce a correct, stable keyset scan against real Postgres data.

- [ ] **Step 3: Lint, typecheck, format, commit**

```bash
pnpm --filter api lint:fix && pnpm --filter api typecheck && pnpm --filter api format
git add apps/api/src/utils/pagination/keyset/tests/paginated-keyset.db.test.ts
git commit -F - <<'EOF'
test: exercise keyset pagination end-to-end against a real App query

Proves cursor + keysetComparison produce a correct compound WHERE and that
a mid-scan insert never duplicates or skips rows (the keyset stability
guarantee offset pagination lacks).

Refs #132

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: Full-suite verification + additive-only proof

**Files:** none (verification only).

- [ ] **Step 1: Run the whole api gate exactly as CI does**

```bash
docker compose up -d
pnpm --filter api format:check
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test          # clean + build + test:setup + test:run (coverage gates 80/75/75)
```

Expected: all green. If coverage dips below a floor, add a missing constructor/branch test to the relevant `*.unit.test.ts` (do NOT lower the floor).

- [ ] **Step 2: Prove the change is additive (no contract drift)**

```bash
pnpm --filter api generate:openapi
git status --porcelain apps/api/openapi.json
```

Expected: **empty output** — `openapi.json` is unchanged, because no controller/DTO wired to an endpoint was touched. If it shows a diff, something imported a pagination DTO into a live controller — revert that; endpoint adoption is the follow-up ticket. Restore any regenerated-but-unchanged file with `git checkout -- apps/api/openapi.json` if needed.

- [ ] **Step 3: Confirm the final file tree**

```bash
find apps/api/src/utils/pagination -type f | sort
```

Expected (23 files — 15 source + 8 test):

```
apps/api/src/utils/pagination/keyset/cursor.ts
apps/api/src/utils/pagination/keyset/keyset-comparison.ts
apps/api/src/utils/pagination/keyset/paginated-keyset-response-meta.ts
apps/api/src/utils/pagination/keyset/paginated-keyset-search.query.ts
apps/api/src/utils/pagination/keyset/paginated-keyset.query.ts
apps/api/src/utils/pagination/keyset/paginated-keyset.response.ts
apps/api/src/utils/pagination/keyset/tests/cursor.unit.test.ts
apps/api/src/utils/pagination/keyset/tests/keyset-comparison.unit.test.ts
apps/api/src/utils/pagination/keyset/tests/paginated-keyset.db.test.ts
apps/api/src/utils/pagination/keyset/tests/paginated-keyset.unit.test.ts
apps/api/src/utils/pagination/offset/paginated-offset-response-meta.ts
apps/api/src/utils/pagination/offset/paginated-offset-search.query.ts
apps/api/src/utils/pagination/offset/paginated-offset.query.ts
apps/api/src/utils/pagination/offset/paginated-offset.response.ts
apps/api/src/utils/pagination/offset/tests/paginated-offset-query.unit.test.ts
apps/api/src/utils/pagination/offset/tests/paginated-offset-response.unit.test.ts
apps/api/src/utils/pagination/offset/tests/paginated-offset.db.test.ts
apps/api/src/utils/pagination/pagination.constants.ts
apps/api/src/utils/pagination/search/filter.query.ts
apps/api/src/utils/pagination/search/search.query.ts
apps/api/src/utils/pagination/search/sort-direction.ts
apps/api/src/utils/pagination/search/sort.query.ts
apps/api/src/utils/pagination/search/tests/search-layer.unit.test.ts
```

The design/plan docs under `docs/` are separate and not part of this count. No commit needed if everything is already committed; this task is a gate, not a change.

---

## Post-plan: opening the PR (outside the TDD loop — CEO-gated)

Not a plan task — done after all tasks pass. Push the branch, open the PR with a Summary + Glossary + `Refs #132`, invoke Rex (`/code-review`), and stop at the per-PR CEO merge gate. The Solution Architect review does not apply (no design artifact in the diff beyond docs); the security gate does not apply (no auth/crypto/secrets touched).

## Self-Review

**1. Spec coverage:**
- `src/utils/pagination/` layout → Tasks 1–8 create every file in the spec's tree. ✓
- Offset Query/Response + meta → Tasks 2, 3. ✓
- Keyset Query/Response + meta + cursor + comparison → Tasks 5, 6, 7. ✓
- Search layer (SortDirection, SortQuery, FilterQuery, SearchQuery) → Task 1. ✓
- `offset` (not page) params → Task 2 uses `offset`/`limit`. ✓
- `FilterQuery` name kept → Task 1. ✓
- Nested query via qs + `@ValidateNested`/`@Type` → Tasks 2, 7. ✓
- ORM-agnostic core; keyset WHERE isolated to adopting repo → shipped source has no `@mikro-orm/*` import; the `keysetWhere` translation lives only in the Task 8 `.db.test.ts`. ✓
- Real-entity/real-EM de-risking tests → Tasks 4, 8. ✓
- Coverage gate respected → every concrete DTO/meta/response constructor + both helpers are instantiated/exercised in unit tests. ✓
- Additive-only / no contract change → Task 9 Step 2 proves `openapi.json` unchanged. ✓
- `SearchQuery` optional members + `FilterQuery` abstract class (the two flagged refinements) → Task 1 source. ✓

**2. Placeholder scan:** No TBD/TODO; every code + test step contains full content; every run step has an exact command + expected result. ✓

**3. Type consistency:** `CursorPayload { sortValue, id }` is produced in Task 5 and consumed unchanged in Task 6 (`keysetComparison`) and Task 8. `KeysetComparison` fields (`sortField/idField/operator/sortValue/id`) match between Task 6's definition and Task 8's `keysetWhere`. `PaginatedOffsetResponseMeta(total, offset, limit)` / `PaginatedKeysetResponseMeta(nextCursor, hasMore, limit)` constructor argument orders match every call site. `SortDirection.ASC → '$gt'`, `DESC → '$lt'` is consistent across Task 6 source, its unit test, and Task 8. ✓
