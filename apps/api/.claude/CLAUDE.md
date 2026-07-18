# CLAUDE.md — apps/api

Backend-specific guidance. The root `marsa/.claude/CLAUDE.md` covers monorepo-wide concerns; this file adds api-only detail.

## Database (MikroORM)

ORM is **MikroORM v6** (`@mikro-orm/postgresql`). Config at `src/sql/mikro-orm.config.ts`.

- Connection: `clientUrl` (full URI) + separate `dbName` env var. Never individual host/port/user/password fields.
- Naming: `UnderscoreNamingStrategy` is built-in — no plugin needed.
- `discovery: { warnWhenNoEntities: false }` in the shared config until the first entity exists — remove it then.
- Use `orm.migrator` not `orm.getMigrator()` (deprecated in v6).
- `entitiesTs` is unnecessary — entity discovery uses `entities: ['dist/src/**/*.entity.js']` against compiled output, config path passed via `--config` in each migration script. `migrations.pathTs` (`src/sql/migrations`) **is** needed alongside `migrations.path` (`dist/src/sql/migrations`) — without it, `migration:create` writes the new `.ts` file straight into `dist/`, where it's lost on the next clean build, instead of into `src/` where it belongs.
- **Migrations must carry a descriptive name** (marsa#73). Always run `pnpm --filter api migration:create --name=<describe_the_change>` (e.g. `--name=add_deploy_status_to_app`), which produces `Migration<timestamp>_<name>.ts` instead of a timestamp-only file. This is enforced by the `migrations.fileName` callback in `mikro-orm.config.ts` — running `migration:create` **without** `--name` throws rather than generating a nameless migration. The timestamp prefix stays first so files remain sortable by execution order (never lead the filename with the name). Existing timestamp-only migrations are **not** renamed — MikroORM tracks applied migrations by filename in `mikro_orm_migrations`, so renaming a run migration would make it look pending again; the convention is going-forward only.
- Feature modules register entities with `MikroOrmModule.forFeature([Entity])`. `DatabaseModule` is global so `MikroORM` and `EntityManager` are available everywhere.
- **No bare `@Property()`.** Every column declares explicit options — at minimum `type`, plus `nullable` / `length` / `unique` / `default` where they apply — so the entity is the readable source of truth for the table and doesn't silently couple the column to the field's inferred TS type. Handbook: `handbooks/domain/marsa-api/mikroorm-property-options.md`.
- **UUID primary keys are named `uuid`, not `id`** (and FK columns referencing them are `*_uuid`) so the key type is self-documenting. Handbook: `handbooks/domain/marsa-api/uuid-primary-key-naming.md`.
- **Nullable columns reflect nullability in the TS type** — a `nullable: true` column is typed `?: T | null`, not `?: T`, so the field doesn't hide the `null` a DB read can return. Handbook: `handbooks/domain/marsa-api/nullable-column-type.md`.
- **Model relations with an explicit FK reference** — `@ManyToOne(() => Parent, { ref: true })` typed `Ref<Parent>` so the foreign key is first-class and the parent key is readable without a load; no duplicate scalar FK column. Handbook: `handbooks/domain/marsa-api/explicit-fk-relation.md`.
- Test isolation: `TestSetup` forks the EM (`orm.em.fork()`), opens a transaction in `initialize()`, rolls back in `teardown()`.
- `global-setup.ts` runs migrations by booting via `compileTestModule` and getting `MikroORM` from DI — not via a direct `MikroORM.init()` outside the module system.

## Stack

NestJS 11 on **Fastify** (`@nestjs/platform-fastify`). `@nestjs/platform-express` is a transitive dep — do not switch the adapter without reason. Package is **ESM** (`"type": "module"`), Node >= 24.

## Entry, prefix, versioning

`src/entrypoints/api.ts` bootstraps `ApiModule` behind a `FastifyAdapter` configured with a `qs`-based querystring parser. Global prefix `/api`. URI versioning is enabled (`@Controller({ version: '1' })` → `/api/v1/...`).

The Fastify adapter config is duplicated in `src/test/setup/test-bench.ts` (`TestBench.createApp`). **Keep both in sync** — same parser, same router options. If you change one, change the other.

## OpenAPI contract (web consumes this)

The api is the source of truth for the web↔api contract. `src/entrypoints/generate-open-api.ts` boots `ApiModule` with `{ preview: true }` (no DB connection), re-applies the same global prefix + URI versioning as `entrypoints/api.ts`, and writes a **committed** `apps/api/openapi.json`. Run `pnpm --filter api generate:openapi` after changing any endpoint, DTO, or decorator, and commit the result — CI drift-checks it.

- Because the SWC build ignores the `@nestjs/swagger` CLI plugin, response shapes must come from **explicit `@ApiProperty` decorators on a DTO class** (an exported `interface` produces no schema). Annotate controllers with `@ApiOperation({ operationId })` + `@ApiOkResponse({ type: Dto })`.
- **`operationId` convention: version-suffix it** (e.g. `getApiInfoV1`, not `getApiInfo`). The web's generator names the operation-response type after the operationId; without the version suffix it collides with the DTO schema type and emits an ugly `…Response2` alias. Suffixing keeps the schema type (`GetApiInfoResponse`) and the operation type (`GetApiInfoV1Response`) distinct, and mirrors the URI version.
- **Enums surfaced in a DTO expose a co-located `<Enum>ApiProperty` decorator** — every `*.enum.ts` that appears in an API response/DTO exports a decorator factory alongside the enum, e.g.

  ```ts
  export const DeployStatusApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
    ApiProperty({ ...options, enum: DeployStatus, enumName: 'DeployStatus' })
  ```

  DTO fields then use `@DeployStatusApiProperty()`, **never** an inline `@ApiProperty({ enum: DeployStatus, enumName: 'DeployStatus' })`. This keeps the `enum` + `enumName` pairing defined once in the enum's own file so it can't drift (a bare `@ApiProperty({ enum })` missing `enumName` makes the web generator emit an anonymous inline union instead of a named type). Mirrors the co-located MikroORM `<Enum>Enum` mapping decorator already in the same file. When an enum lives only in a response file today (e.g. a health-verdict enum), promote it to its own `*.enum.ts` if it needs the decorator.

## Source layout

Two top-level source areas with distinct roles:

- `src/app/` — **features** (vertical slices). One folder per **domain aggregate root** (see "Feature module boundaries" below for the split criterion), e.g. `app-management/`, `deployments/`, `auth/`, `user/`, `github-app/`.
- `src/modules/` — **support modules**: cross-cutting infrastructure that features depend on, plus the production composition module (`api/api.module.ts`). Not feature code.

Other directories: `src/entrypoints/` (process bootstraps), `src/test/` (test harness + global setup), `src/utils/`, `src/sql/`.

## Module composition

Layered so tests can swap pieces:

- `AppModule.forRoot(modules)` (`src/app.module.ts`) — root dynamic module. Always imports `DatabaseModule` plus whatever feature modules you pass.
- `ApiModule` (`src/modules/api/api.module.ts`) — production composition; calls `AppModule.forRoot([...featureModules])`. Booted by `entrypoints/api.ts`.
- `TestModule.forRoot(modules)` (`src/test/test.module.ts`) — parallel composition root for tests; mirrors `AppModule` (imports `DatabaseModule` directly + spread modules). Never nests inside `AppModule`.

`AppModule` and `TestModule` are parallel roots — infrastructure like `DatabaseModule` belongs in both directly, not passed in by callers. When you add a feature, register its module in `ApiModule` only.

## Feature module boundaries (when to split)

`src/app/` is organised **one feature module per domain aggregate root** — not per business capability, per REST resource, or per team. This is the criterion inherited from the upstream NestJS project template marsa is built on, where `users`, `user-preferences`, `api-key`, and `roles` are each their own module — `user-preferences` is split out from `users` because it is a _distinct aggregate_, even though both are "user stuff". A capability rule would have kept them together; the aggregate rule splits them. That's the tell.

The rule:

- **A feature module owns exactly one aggregate root** — its entity (or tightly-bound entity cluster), that entity's `entities/` / `errors/` / `enums/` / `events/`, and every use-case whose primary read/write target is that aggregate. The module is named after the aggregate: `deployments/` owns `Release`, and (per marsa#131) `App` management is extracted into its own feature that owns `App`.
- **A use-case lives with the aggregate it primarily reads or writes** — not the URL noun it is addressed by. `get-app-run-logs` and `get-app-health` are addressed under an app but read _deployment/runtime_ state from Kubernetes, not the `App` record, so they stay in `deployments/`. Ask "which aggregate's lifecycle is this use-case about?", never "which word is in the route?" — following the route noun is the trap this rule exists to avoid.
- **Split a new module out when a cluster of use-cases centres on a different aggregate** than the one the current module owns. One module holding two aggregates — as `DeploymentsModule` did with `App` + `Release` (marsa#131) — is the smell this rule catches; extract the smaller aggregate into its own feature that owns it.
- **Shared building blocks are the only cross-feature seam.** A use-case never imports from a sibling use-case or another feature's internals; if two features genuinely need the same code, promote it to `src/modules/` or a workspace package (see "Feature shape" below). Reaching into another feature's `entities/` is a boundary violation, not a shortcut.

Driver + options considered (aggregate ownership vs. business capability vs. REST resource): `docs/agdr/AgDR-0040-feature-module-boundary-aggregate-ownership.md` (marsa#131).

## Feature shape (vertical slice)

Each feature under `src/app/<feature>/` is a self-contained vertical slice: HTTP endpoints, domain logic, persistence, and feature-local types all live together. A feature owns everything it needs and exposes a single module.

Typical contents (use only what's relevant):

```
src/app/<feature>/
  <feature>.module.ts            # feature root module; imported by ApiModule
  use-cases/
    <use-case>/
      <use-case>.module.ts       # use-case wiring
      <use-case>.controller.ts   # one controller per use-case; injects the use-case
      <use-case>.use-case.ts     # application logic — class <Action>UseCase
      <use-case>.command.ts      # input DTO — class <Action>Command
      <use-case>.command.builder.ts # test-side builder for the command
      <use-case>.repository.ts   # use-case-scoped DB access (wraps a forked EM)
      <use-case>.response.ts     # output DTO — class <Action>Response (with a constructor)
      tests/
        <use-case>.use-case.unit.test.ts
        <use-case>.e2e.test.ts
  entities/                       # feature-owned domain entities (each with a <entity>.builder.ts)
  errors/                         # feature-specific error types
  ...                             # repositories, events, value objects, etc. as needed
```

Conventions:

- **Name after the folder, not the transport.** The application class is `<Action>UseCase` (file `<use-case>.use-case.ts`), **not** `<Action>Service` — the folder is `use-cases/`, and `…Service` is reserved for shared support code under `src/modules/`. The input DTO is `<action>.command.ts` exporting `<Action>Command`, **not** `.request.ts` / `…Request`. The controller keeps `…Controller`, injects the use-case as `private readonly usecase: <Action>UseCase`, and delegates to it. Handbook: `handbooks/domain/marsa-api/use-case-naming.md`.
- **Response DTOs declare a constructor** and are returned via `new <Action>Response(...)` — never an object-literal cast (`{ … } as <Action>Response`) or field-by-field mutation. When a response field mirrors a domain entity or shared type, the constructor takes that **entity/type**, not separated fields; a **nested object** field gets its own `@ApiProperty()`-decorated class, never an inline `interface`. Handbook: `handbooks/domain/marsa-api/response-constructors.md`.
- **Build every entity via a `<Entity>Builder`** (`entities/<entity>.builder.ts`, fluent `withX().build()`) — never inline field assignment, no field-count threshold. Handbook: `handbooks/domain/marsa-api/entity-builder.md`.
- **Builders declare a constructor seeding sensible defaults** for required fields, so `new XBuilder().build()` is always valid and a test overrides only the field under test; applies to entity **and** command builders, and when you add it to one builder update its siblings in the same PR. Handbook: `handbooks/domain/marsa-api/builder-constructor-defaults.md`.
- **Commands** are class-validator DTOs Nest deserialises from the request body; on the request path you never hand-build them. For constructing a command in **tests**, use a `<Action>CommandBuilder` (`<use-case>.command.builder.ts`) instead of inline object literals. Handbook: `handbooks/domain/marsa-api/command-builder.md`.
- **Validate at the DTO boundary** — presence/type/shape checks live on the command DTO as `class-validator` decorators (`@IsString()`, `@IsNotEmpty()`, …) enforced by the global `ValidationPipe`; do **not** re-check the same things manually inside the use-case. Handbook: `handbooks/domain/marsa-api/validation-in-dto.md`.
- **A use-case's DB access goes through its own `<use-case>.repository.ts`** (class `<Action>Repository`, co-located in the slice) — never a raw `EntityManager` injected into the use-case. The repository wraps `em.fork()` internally for request isolation; the use-case depends on the repository, which makes it mock-trivial. Repositories are **use-case-scoped** (like commands/responses), not feature-wide aggregate repos. Handbook: `handbooks/domain/marsa-api/use-case-repository.md` · AgDR-0011.
- **Document every error a use-case throws** on its controller via the matching `@Api*Response()` decorator (`@ApiBadRequestResponse`, `@ApiResponse({ status: 502 })`, …) so the OpenAPI contract reflects the real response set, not just the happy path. Handbook: `handbooks/domain/marsa-api/document-thrown-errors.md`.
- **Share a service across use-cases via its own module** — put the service in a `<Service>Module` that `providers` **and** `exports` it, then `imports` that module wherever it's needed; don't re-list the provider in each use-case module. Handbook: `handbooks/domain/marsa-api/service-sharing-via-module.md`.
- **One client seam per external service** — define a single abstract class (e.g. `GithubClient`) for an external service, add capabilities as methods, and bind it via a NestJS module factory (real impl in prod, network-free mock under `NODE_ENV=test`); don't spawn a new `*Service`/`*Client` per feature against the same service. Handbook: `handbooks/domain/marsa-api/external-client-seam.md` · AgDR-0014. (marsa#70)
- **Magic values live in a `.constant(s).ts`** — extract domain-significant literals (especially ones shared across DTO validator, use-case, and tests) to a named export co-located with the owning use-case/module. Handbook: `handbooks/domain/marsa-api/constants-file.md`.
- **Shared types live in a `.types.ts`** — exported `type`/`interface` shapes consumed across files go in a co-located `.types.ts`, not inline at the top of a service/use-case. Handbook: `handbooks/domain/marsa-api/types-file-placement.md`.
- **Place utility functions by reach** — a helper used by a single use-case/module lives in that feature's local `utils/`; a genuinely cross-cutting helper goes in `src/utils/`. Don't leave general-purpose helpers inline in a use-case or config file. Handbook: `handbooks/domain/marsa-api/util-placement.md`.
- **Comments explain non-obvious _why_, not _what_** — don't narrate what the code already states; trust the reader to ask in review if something's unclear. Handbook: `handbooks/domain/marsa-api/no-redundant-comments.md`.
- Use-cases have their own `*.module.ts`; the feature's `<feature>.module.ts` imports its use-case modules.
- Feature-internal code (entities, errors, etc.) stays inside the feature folder. If something needs to be shared across features, promote it to `src/modules/` or a workspace package — don't reach into another feature.
- Tests sit in `tests/` next to the code they cover, with `.unit.test.ts` and `.e2e.test.ts` suffixes.
- **Test the right layer** — three test types, each with a distinct scope:
  - **E2E tests** (`.e2e.test.ts`) — exercise the full HTTP stack for API endpoints. One happy path + one bad path per use-case is sufficient; exhaustive coverage belongs in unit tests, not here.
  - **Unit tests** (`.use-case.unit.test.ts`) — test the use-case class directly (no HTTP, no DB). Focus on side-effect branches and error paths that e2e tests don't cover. Does not need to be exhaustive — be sensible about what's worth testing at this level.
  - **Integration tests** (`.integration.test.ts`) — for code that has no HTTP entry point (jobs, event handlers, scheduled tasks). Boot the module, drive the logic directly.
  - **Repositories do not get dedicated tests** — they're thin `em.fork()` wrappers covered implicitly by e2e tests.
    Handbook: `handbooks/domain/marsa-api/test-layer-boundaries.md`.
- **Stub collaborators with sinon `createStubInstance(Class)`** in unit tests — not object literals cast through `as unknown as <Class>`; the stub stays in sync with the class signature and gives call-tracking for free. Handbook: `handbooks/domain/marsa-api/sinon-stub-instance.md`.

## Test harness

Tests use the **Node.js built-in test runner** (`node:test` + `node:assert/strict`). The pipeline runs against compiled output in `dist/`, not ts-node.

`src/test/setup/test-bench.ts`:

- `TestBench.setupEndToEndTest()` — boots the full `ApiModule`.
- `TestBench.setupModuleTest(MyModule)` — boots `AppModule.forRoot([MyModule])` to isolate one feature.
- `TestBench.setupIntegrationTest(module)` — generic primitive; the two above delegate to it. Caches booted apps per module so repeated calls reuse them.
- Requires `NODE_ENV=test`.

`TestSetup` (`src/test/setup/test-setup.ts`) wraps the booted app and is where DB transactions / auth context will be plumbed in.

`global-setup.ts` runs once before the test run (compiled output executed by `test:setup` script) — use it for migrations and other one-time bootstrapping.

## Build pipeline (gotcha)

`nest build` uses the **SWC builder** (`nest-cli.json` → `compilerOptions.builder.type: "swc"`), not tsc. This means:

- `tsconfig.json`'s `module`/`target` are **ignored at build time** — SWC reads `.swcrc` instead. The tsconfig is only used for type-checking and editor IntelliSense.
- `.swcrc` must keep `module.type: "nodenext"` so output is ESM. With `"type": "module"` in `package.json`, CommonJS output crashes at load: `ReferenceError: exports is not defined`.
- Decorator metadata for Nest DI requires `jsc.transform.legacyDecorator` + `decoratorMetadata` in `.swcrc`.
- Source imports use explicit `.js` extensions (NodeNext ESM requirement). SWC preserves them as-is; never strip them.

If you add a new TS compiler option that affects emit (e.g. target, module resolution), mirror it in `.swcrc` — touching only `tsconfig.json` will silently have no effect on the built output.

## Imports

- **Subpath imports**, not relative paths: `#src/*` → `./src/*`, `#test/*` → `./src/test/*`. Mapped in `tsconfig.json` `paths`, `package.json` `imports` (which points at `dist/` for runtime resolution), and `.swcrc` `jsc.paths`. Relative imports (`./*`, `../*`) are an ESLint error.
- Always include the **`.js` extension** in import specifiers (`#src/foo/bar.js`), even when importing a `.ts` file. NodeNext ESM resolution requires it.
- Import order (enforced by `simple-import-sort`): side-effects → `node:` → packages → `#src/*` → `#test/*` → other. The block is a **single group with no blank lines between sub-groups** — imports are sorted into that order but not visually separated (GH-69).
- A blank line is required after the last import block, before the first statement (`padding-line-between-statements`).
- Unused imports/vars are errors. Prefix intentionally-unused args with `_`.

## Scripts

```bash
pnpm dev                # nest start --watch with .env loaded
pnpm build              # nest build (via SWC, output to dist/)
pnpm start:prod         # node dist/main

pnpm lint               # eslint over src + test
pnpm lint:fix

pnpm test               # clean → build → test:setup → test:run
pnpm test:setup         # global-setup against compiled output
pnpm test:run           # node --test; coverage config in node.config.json
```

`pnpm test` runs the full pipeline. There is no ts-node / watch test mode — change code, rebuild, rerun.

## Env files

`.env` (dev) and `.env.test` (tests) are loaded via Node's `--env-file` flag, not `dotenv`. Both are required at the api root.

## Deployment

Target is K3s. If/when adding `trustProxy` to the Fastify adapter, the loopback default (`127.0.0.1/8`) is wrong for in-cluster traffic — use the cluster CIDRs (`10.42.0.0/16` pods, `10.43.0.0/16` services) or broader RFC1918 ranges.
