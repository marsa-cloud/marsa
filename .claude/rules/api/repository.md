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

  async listApps(): Promise<App[]> {
    return this.db.query.appTable.findMany({ orderBy: { createdAt: 'desc' } })
  }
}
```

`DatabaseModule` is `@Global()`, so no feature-level registration is needed.

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

## Repositories get no dedicated tests

They are thin query wrappers, covered implicitly by the slice's e2e test. See
`.claude/rules/api/tests.md`.
