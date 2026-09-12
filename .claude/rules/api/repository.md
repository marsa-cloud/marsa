---
paths:
  - 'apps/api/src/app/**/*.repository.ts'
---

# Repositories

Use-case-scoped, co-located in the slice, named `<Action>Repository`. There are no
feature-wide aggregate repositories.

## Inject the database with the decorator

```ts
// RIGHT
@Injectable()
export class ViewAppIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listApps(limit: number, after?: AppUuid | null): Promise<App[]> {
    return this.db
      .select()
      .from(appTable)
      .where(after ? lt(appTable.uuid, after) : undefined)
      .orderBy(desc(appTable.uuid))
      .limit(limit)
  }
}
```

`DatabaseModule` is `@Global()`, so no feature-level registration is needed.

## Index reads are paginated — never return a whole collection

```ts
// WRONG — unbounded; grows until it times out or blows the response
async listApps(): Promise<App[]> {
  return this.db.query.appTable.findMany({ orderBy: { createdAt: 'desc' } })
}
```

Every index endpoint takes a keyset limit + cursor and seeks on the `uuidv7` primary key
(`lt` for newest-first, `gt` for oldest-first) — the key is time-ordered, so the PK index
already serves the seek and no composite index is needed. Clamp the page size with
`keysetLimit(query.pagination)`, never with a raw `query.pagination?.limit`.

The cursor and page assembly live on a per-use-case `<UseCase>QueryKey` DTO with
`static from(row)` / `static nextKey(rows)` — see `.claude/rules/api/response-dto.md` and
AgDR-0040. `nextKey` reads the last row **returned**; building it from anything else is the
page-boundary off-by-one.

## Return row types, not response shapes

```ts
// WRONG — the repository knows about the HTTP contract
async listApps(): Promise<AppSummary[]>

// RIGHT
async listApps(): Promise<App[]>
```

Why: mapping to the response is the use-case's job. A repository that returns DTOs cannot
be reused by a second use-case with a different contract.

## Take an explicit `Executor` when the write joins a wider unit of work

```ts
// WRONG — commits on its own connection, outside the caller's transaction
async createRelease(release: Release): Promise<void> {
  await this.db.insert(releaseTable).values(release)
}

// RIGHT — the caller passes its transaction
async createRelease(tx: Executor, release: Release): Promise<void> {
  await tx.insert(releaseTable).values(release)
}
```

Why: `Executor = Database | Transaction`. Taking it as the first parameter lets one unit of
work span several repositories. Reads that stand alone keep using `this.db`.

## Repositories get no dedicated tests — unless they hold an invariant

A repository that is a thin query wrapper is covered implicitly by the slice's e2e test.
Write a `<action>.repository.db.test.ts` only when the repository enforces a rule of its own
— a transaction, a lock, a conditional write — **and** that rule cannot be reached through
the endpoint.

```ts
// The last-operator check in update-user-role lives behind a self-change rule and an
// operator-only guard, so no single request can reach it. Concurrency can.
const outcomes = await Promise.all([
  repository.updateRole(first.uuid, UserRole.Member),
  repository.updateRole(second.uuid, UserRole.Member),
])
```

Why: the "no tests" rule exists because a query wrapper has nothing of its own to assert.
Once one owns an invariant, the e2e test can no longer see it, and an untested lock is a
lock that quietly stops working. See `.claude/rules/api/tests.md`.
