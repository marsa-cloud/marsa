---
paths:
  - 'apps/api/src/app/**/*.use-case.ts'
---

# Use-cases

The application layer. Named `<Action>UseCase` in `<use-case>.use-case.ts`.

## Name it UseCase, not Service

```ts
// WRONG
export class ViewAppIndexService {}

// RIGHT
export class ViewAppIndexUseCase {}
```

Why: the folder is `use-cases/`. `…Service` is reserved for shared support code under
`src/modules/`, so the suffix tells a reader which layer they are in.

## Depend on the repository, never on the database

```ts
// WRONG
constructor(@InjectDatabase() private readonly db: Database) {}

// RIGHT
constructor(
  private readonly repository: ViewAppIndexRepository,
  private readonly config: ConfigService,
) {}
```

Why: a use-case holding a `Database` cannot be unit-tested without a live Postgres. With a
repository, `createStubInstance(ViewAppIndexRepository)` is the whole setup.

## Return a constructed response

```ts
// RIGHT
const apps = await this.repository.listApps()
return new ViewAppIndexResponse(apps, baseDomain)
```

## Do not re-validate the command

Presence, type, and shape are already enforced by the `ValidationPipe`. A use-case checks
**domain** rules (does this app exist, is this transition legal) only. See
`.claude/rules/api/command-dto.md`.

## Naming

The `<Action>` prefix comes from the use-case folder name, and the folder vocabulary
(`view-<entity>-index`, `create-<entity>`, domain-verb exceptions) is in
`apps/api/.claude/CLAUDE.md` — you pick it before this file exists.
