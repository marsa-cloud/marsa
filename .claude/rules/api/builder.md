---
paths:
  - 'apps/api/src/**/*.builder.ts'
---

# Builders

Every entity, every command and every query gets a fluent builder. Tests never assemble any
of them from an object literal.

## Seed valid defaults in the constructor

```ts
// WRONG — every test must supply every field
export class AppBuilder {
  private readonly app = {} as App
}

// RIGHT
export class AppBuilder {
  private readonly app: App

  constructor() {
    const now = new Date()
    this.app = {
      uuid: generateUuid<AppUuid>(),
      slug: 'my-app',
      domain: { type: 'subdomain' },
      image: 'nginx:1.27',
      containerPort: 80,
      replicas: 1,
      env: {},
      imagePullCredentialsEnc: null,
      createdAt: now,
      updatedAt: now,
    }
  }
}
```

Why: `new AppBuilder().build()` must always be valid, so a test overrides only the field
under test. That is what makes the test's intent readable.

## Return `this` from every setter

```ts
// RIGHT
withSlug(slug: string): this {
  this.app.slug = slug
  return this
}

build(): App {
  return this.app
}
```

## Add a column to the table, add it to the builder — same PR

A new non-nullable column with no builder default breaks every existing test with an error
that names the column, not the cause. When you add a `withX` to one builder, check its
siblings in the same feature.

## Query builders extend the shared keyset base

A paginated query DTO is three nested classes (`<Action>Query` → `<Action>PaginationQuery` →
`<Action>QueryKey`), so assembling one inline costs four lines before the test says anything.
`KeysetQueryBuilder` owns `withLimit` / `withKey` / `withoutPagination` / `build`; the
per-use-case subclass supplies the concrete DTOs and a `withCursorAt(row)` that builds the key
from a row.

```ts
// WRONG — the nesting, in every test that pages
const query = new ViewAppIndexQuery()
query.pagination = new ViewAppIndexPaginationQuery()
query.pagination.limit = 3
query.pagination.key = ViewAppIndexQueryKey.from(app)

// RIGHT
const query = new ViewAppIndexQueryBuilder().withLimit(3).withCursorAt(app).build()
```

```ts
export class ViewAppIndexQueryBuilder extends KeysetQueryBuilder<
  ViewAppIndexQuery,
  ViewAppIndexPaginationQuery,
  ViewAppIndexQueryKey
> {
  constructor() {
    super(new ViewAppIndexQuery(), new ViewAppIndexPaginationQuery())
  }

  withCursorAt(app: App): this {
    return this.withKey(ViewAppIndexQueryKey.from(app))
  }
}
```

It lives next to the DTO it builds — `use-cases/<use-case>/query/<use-case>.query.builder.ts` —
mirroring `<use-case>.command.builder.ts`. `withoutPagination()` is how a test asks for the
no-pagination default; do not reach for an `if (limit === undefined)` branch in a local helper.

The built object doubles as the HTTP query in an e2e test — `.query(builder.build())` serializes
the same nesting supertest's `qs` produces.
