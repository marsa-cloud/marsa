---
paths:
  - 'apps/api/src/**/tests/**/*.ts'
---

# Tests

Runner is Node's built-in `node:test` with `expect`. The suite runs against compiled output
in `dist/` — there is no watch mode. Change code, then `pnpm --filter api test`.

## Pick the layer by what has an HTTP entry point

| Suffix                   | Scope                                 | How much                           |
| ------------------------ | ------------------------------------- | ---------------------------------- |
| `.e2e.test.ts`           | full HTTP stack for one endpoint      | one happy path + one bad path      |
| `.use-case.unit.test.ts` | the use-case class, no HTTP, no DB    | side-effect branches, error paths  |
| `.integration.test.ts`   | jobs, event handlers, scheduled tasks | boot the module, drive it directly |

Repositories get **no** dedicated tests — see `.claude/rules/api/repository.md`.

## Seed e2e fixtures with direct inserts

```ts
// WRONG — seeds through an endpoint that isn't under test
await request(setup.httpServer).post('/api/v1/deploy').send(command).expect(200)

// RIGHT — arrange exactly the rows the test needs
const app = new AppBuilder().withSlug(SLUG).build()
await setup.db.insert(appTable).values(app)
await setup.db.insert(releaseTable).values(new ReleaseBuilder().withApp(app).build())
```

Why: seeding through a write endpoint couples the test to a use-case it isn't testing — that
endpoint's validation and side effects can fail a test whose subject is elsewhere, and the
failure then points at the wrong slice. Direct inserts also arrange states no endpoint can
produce (a `failed` release, an orphaned row).

`TestSetup.authenticate()` is the one sanctioned exception: a session cookie can only be
minted by the real login flow.

## Stub collaborators with sinon

```ts
// WRONG
const repository = {
  loadProvisionedApp: async () => app,
} as unknown as CaptureInstallationRepository

// RIGHT
const repository = createStubInstance(CaptureInstallationRepository)
repository.loadProvisionedApp.resolves(app)
```

Why: the stub tracks the real class signature, so a renamed method fails the test instead of
silently passing. Call assertions come free.

## Isolation is truncation, not rollback

`TestSetup.teardown()` calls `truncateAll(db)`. The request path commits on its own pooled
connections, so there is no ambient transaction to roll back — always call `teardown()`, and
never assume a test's writes disappear on their own.

## Boot with the right bench

```ts
// unit — no app boot
describe('CaptureInstallationUseCase', () => {
  before(() => TestBench.setupUnitTest())
})
```

- `TestBench.setupEndToEndTest()` — boots the full `ApiModule`.
- `TestBench.setupModuleTest(MyModule)` — boots `AppModule.forRoot([MyModule])` to isolate one feature.
- `TestBench.setupIntegrationTest(module)` — the primitive both delegate to; caches booted apps per module so repeated calls reuse them.

All of them require `NODE_ENV=test`.
