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

## Give every awaited call its own line

```ts
// WRONG — the await is buried inside another expression
return new ViewNodeIndexResponse(await this.nodes.listNodes())
if (!(await this.repository.insert(project))) {
}

// RIGHT — name the result, then use it
const nodes = await this.nodes.listNodes()
return new ViewNodeIndexResponse(nodes)

const inserted = await this.repository.insert(project)
if (!inserted) {
}
```

Why: an awaited call is where the use-case waits on I/O and where it can fail. On its own line it
gets a name, a breakpoint, and a stack frame that points straight at it; nested inside a
constructor call or a negated condition, a reader has to parse the whole expression to find where
control actually leaves the function.

Existing sites that predate this rule are tracked in #227 — fix them in that sweep, not piecemeal.

## Naming

The `<Action>` prefix comes from the use-case folder name, and the folder vocabulary
(`view-<entity>-index`, `create-<entity>`, domain-verb exceptions) is in
`apps/api/.claude/CLAUDE.md` — you pick it before this file exists.
