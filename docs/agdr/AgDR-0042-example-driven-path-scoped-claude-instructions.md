---
id: AgDR-0042
timestamp: 2026-08-08T00:00:00Z
agent: claude
model: claude-opus-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#71
---

# Coding conventions move from prose in CLAUDE.md to example-driven path-scoped rules

> In the context of Claude Code producing code that draws avoidable review comments, facing package `CLAUDE.md` files that had grown past the size at which adherence degrades and had gone factually stale after the Drizzle migration, I decided to **extract per-file-type conventions into path-scoped rule files under `.claude/rules/`, each carrying a mandatory WRONG/RIGHT code pair, leaving only orientation and placement guidance in the always-loaded files**, to achieve higher adherence on less context, accepting that path-scoped rules load only when a matching file is read and are guidance rather than enforcement.

## Context

Three problems, discovered together while investigating marsa#71 ("examples are better than sentences").

**1. The instructions are too long to be followed reliably.** `apps/api/.claude/CLAUDE.md` is 227 lines. The Claude Code documentation targets **under 200 lines per file** and states plainly that longer files "consume more context and reduce adherence", with the explicit remedy: _"When CLAUDE.md approaches 200 lines, start splitting into rules."_ `apps/web/.claude/CLAUDE.md` is 150 lines and heading the same way.

**2. The instructions are wrong.** PR #174 (`refactor(#107)`) migrated persistence from MikroORM to Drizzle. The api file's entire `## Database (MikroORM)` section — config path, `MikroOrmModule.forFeature`, `@Property()` options, `@ManyToOne({ ref: true })`, `orm.em.fork()` test isolation, the `migration:create --name` enforcement — describes code that no longer exists. Claude loads it at the start of every session in `apps/api`. Instructions that are confidently wrong are worse than absent ones.

**3. Twenty pointers lead nowhere.** The same file references `handbooks/domain/marsa-api/<topic>.md` twenty times. No such directory exists, in this repo or anywhere else. Each pointer implies a fuller explanation the reader can consult; none can.

Underneath all three sits the observation in marsa#71 itself: the conventions are written as **prose assertions** ("Response DTOs declare a constructor and are returned via `new <Action>Response(...)` — never an object-literal cast"). A sentence describing a code shape is a lossy encoding of that code shape. A WRONG/RIGHT pair is not.

## Options Considered

| Option                                                              | Pros                                                                                                                                                                                                                                                                  | Cons                                                                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Path-scoped rules per artifact type, WRONG/RIGHT pairs** (chosen) | Loads only for the file type being edited, so context is spent where it applies; examples are unambiguous; the documented remedy for an oversized `CLAUDE.md`; globs key off the repo's existing file-suffix convention, which is how these rules are actually scoped | Rules load on **read**, so authoring a brand-new file may not trigger one; not re-injected after `/compact`; guidance, not enforcement |
| Golden reference slice                                              | One live example CI keeps honest; near-zero prose                                                                                                                                                                                                                     | Says what the shape is, never why; a reader copying it cannot tell which parts are load-bearing and which are incidental to that slice |
| Scaffolding skill (`/new-use-case`)                                 | Closes the new-file gap directly; generated output is correct by construction                                                                                                                                                                                         | Only helps at creation time, not on the far more common edit; a template drifts from the code it templates as silently as prose does   |
| Lint rules (`no-restricted-syntax`)                                 | Guaranteed rather than advisory — the only option that _cannot_ be ignored                                                                                                                                                                                            | Expresses only the mechanically checkable subset; says nothing about aggregate boundaries, test-layer choice, or naming judgment       |
| Leave as prose, just fix the facts                                  | Smallest change                                                                                                                                                                                                                                                       | Does not address marsa#71 at all, and the file stays past the size where adherence degrades                                            |

## Decision

Chosen: **path-scoped rules per artifact type**, because the conventions in question are keyed by **file suffix** (`*.response.ts`, `*.table.ts`, `*.repository.ts`) scattered across `src/app/*/use-cases/*/` rather than by directory — which is exactly the case the Claude Code docs name for preferring central path-scoped rules over per-directory `CLAUDE.md`. Marsa keeps its per-package `CLAUDE.md` files as the documented monorepo pattern, but thinned to orientation.

### The split criterion

This is the load-bearing rule of the whole design, and it also mitigates the read-trigger weakness:

- **How an existing file-type is written** → a path-scoped rule. Opening the file is what triggers it, and opening the file is exactly when the guidance applies.
- **Where a new thing goes** → stays in the package `CLAUDE.md`, always loaded. No file read can trigger a rule about a folder that does not exist yet.

So feature-module/aggregate boundaries, the use-case naming vocabulary, and the "adopt Nuxt Layers on a second domain" trigger stay always-on. Response-DTO construction, Drizzle column declaration, and e2e seeding move to rules.

### Structure

```text
.claude/rules/
  comments.md            # existing, unscoped
  git-workflow.md        # existing, unscoped
  api/
    table.md · response-dto.md · command-dto.md · controller.md
    use-case.md · repository.md · builder.md · module-wiring.md · tests.md
    imports.md · build-config.md
  web/
    composable.md · component.md · tests.md
```

Fourteen rules in total. `imports.md` and `build-config.md` were added while implementing:
applying the split criterion showed that import style and the SWC build gotcha are
file-scoped, not placement guidance, so they left the always-loaded file too.

Rules live at the repository root so `paths:` globs are repo-relative. Each file covers one artifact type and is capped at **120 lines**; the implementation landed at 43–114 lines per file, with `api/table.md` the largest because the DB layer's nine rules are read together.

### Rule file shape

`````markdown
---
paths: ['apps/api/src/app/**/*.response.ts']
---

# Response DTOs

## Return a constructed instance

````ts
// WRONG
return { slug: app.slug, url } as ViewAppIndexResponse

// RIGHT
return new ViewAppIndexResponse(apps, baseDomain)
```text

Why: the cast produces no `@ApiProperty` metadata, so `openapi.json` emits
no schema and the web generator has nothing to type against.
````
`````

```

Every snippet is lifted from real code in this repository. A rule that goes stale therefore becomes **visibly** wrong — someone reading the rule beside the code sees the mismatch — rather than quietly wrong, which is how the MikroORM section survived a whole ORM migration.

### Linking without importing

Each package `CLAUDE.md` carries a pointer table mapping file glob → rule path, written with **backticked plain paths**. An `@path` import would inline every rule at launch and discard the entire context saving, which is the opposite of the goal.

### Factual corrections carried in the same change

| Stale claim                                                       | Reality                                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MikroORM v6, `src/sql/mikro-orm.config.ts`                        | Drizzle `1.0.0-rc.4`, `drizzle.config.ts`, schema barrel `src/sql/schema.ts`                                                                                     |
| `MikroOrmModule.forFeature([Entity])` per feature                 | `@Global() DatabaseModule` + `@InjectDatabase()`; no per-feature registration                                                                                    |
| `migration:create --name=` enforced by a `fileName` callback      | `pnpm db:generate` (drizzle-kit); `migrate()` runs in `onModuleInit` **only under `NODE_ENV=production`**, and in tests via `global-setup.ts`                    |
| Test isolation forks the EM and rolls back a transaction          | `truncateAll(db)` in teardown — the request path commits on its own pooled connections, so there is no transaction to roll back (marsa#171 tracks changing this) |
| `@Property()` options, `@ManyToOne({ ref: true })`, `Ref<Parent>` | Drizzle column builders; relations declared centrally in `src/sql/relations.ts` via v1 `defineRelations`                                                         |
| 20 × `Handbook: handbooks/domain/marsa-api/*.md`                  | Deleted — those files never existed                                                                                                                              |

Conventions the Drizzle migration introduced that were never written down, now captured as rules:

- **Multi-word columns need an explicit snake_case name** — `integer('container_port')`. Omit it and Drizzle emits a camelCase column.
- **Every table must be re-exported from `src/sql/schema.ts`** (enums explicitly). Forget it and drizzle-kit does not see the table.
- **`Executor = Database | Transaction`** is the seam that lets a repository join a caller's unit of work.
- **UUID primary keys are branded** (`uuid().$type<AppUuid>()`) and default to `uuidv7()`; timestamps come from the shared `...timestamps` spread.

### Verification

After the rules land, one session runs with the `InstructionsLoaded` hook enabled to confirm each glob fires on the file it targets. The Claude Code docs offer that hook specifically for debugging path-scoped rules. It is a one-off check, not shipped configuration.

## Consequences

- `apps/api/.claude/CLAUDE.md` drops from 227 to 129 lines; `apps/web/.claude/CLAUDE.md` from 150 to 101 (measured with `wc -l`). Both are well under the 200-line threshold the docs tie to degraded adherence, which is the constraint that matters — what remains is irreducibly placement and orientation. Root `CLAUDE.md` is unchanged: repo layout, commands, and the local-dev runbooks are genuinely always-on.
- Context spent on api conventions during frontend work drops to zero, and vice versa.
- **A brand-new file may not trigger its rule.** Rules load when Claude _reads_ a matching file. In practice Claude reads sibling files before writing a new one, but this is not guaranteed. If it proves to be a real miss, the mitigation is a `paths:`-scoped skill for slice authoring — deliberately deferred rather than built speculatively.
- **Path-scoped rules are not re-injected after `/compact`**; they reload the next time a matching file is read. Anything that must never lapse mid-session belongs in the package `CLAUDE.md`, not a rule.
- **Rules are guidance, not enforcement.** The mechanically-checkable subset — `as <Action>Response` casts, `Database` injected straight into a use-case, `@ApiProperty({ enum })` without `enumName`, `as unknown as <Class>` in tests — could be promoted to ESLint `no-restricted-syntax` errors, which is the only option that cannot be ignored. Considered and deliberately deferred to keep this change documentation-only; it remains the highest-leverage follow-up if review comments persist.
- Rule files are subject to the same staleness risk that produced this record. The mitigation is that examples come from live code, so drift is visible on any read of the surrounding file.
- Four existing records share the number `AgDR-0040`. Not renumbered here (out of scope), but the collision means `AgDR-0040` is ambiguous as a citation; this record uses full filenames when referring to them.

## Artifacts

- marsa#71 — Examples are better than sentences
- marsa#185 — Keyset pagination; carries a matching "revise the AI harness" requirement and must be sequenced against this change rather than run in parallel
- PR #174 / marsa#107 — the MikroORM → Drizzle migration that stranded the api instructions
- `docs/agdr/AgDR-0040-pagination-declaration-only-contract.md` — one of the four colliding 0040 records
```
