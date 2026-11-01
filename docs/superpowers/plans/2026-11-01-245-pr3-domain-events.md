# #245 PR 3 — Domain events module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `src/modules/domain-events`: a `DomainEvent<TContent>` base class, a class-level
`@Subscribe(EventClass)` decorator, and `DomainEventEmitter.emit(tx, events)`, which runs every
subscriber in the caller's transaction. Tests show that a subscriber's job runs after commit and
that a rollback leaves no job. No feature event or subscriber yet (delete-app is PR 4).

**Architecture:** One global `DomainEventsModule` (in `AppModule` and `TestModule`, next to
`JobQueueModule`) provides `DomainEventEmitter`. The emitter finds `@Subscribe` providers through
`DiscoveryService.createDecorator`, the same way `JobRegistry` does. Discovery runs once in
`onModuleInit`, so a broken subscriber fails the boot. On each emit, every subscriber of each event
runs in turn: events in the order given, subscribers in discovery order, with the same `tx`. Each
call is awaited. The first throw propagates unchanged, so the caller's transaction rolls back
together with any job an earlier subscriber sent. Events are not persisted.

**Tech Stack:** NestJS 11 (`DiscoveryService`, `OnModuleInit`), Drizzle `Transaction`, the PR 2
`JobScheduler` / `drainJobs`, `node:test` + `expect` + sinon.

**Spec:** `docs/superpowers/specs/2026-11-01-domain-events-job-queue-design.md` — "Decisions" D3,
"Components → `src/modules/domain-events`", "Error handling" (a subscriber throwing is a bug),
"Testing → Unit" (the emitter) and "Integration" (atomicity), "Delivery" row 3. Decision record:
`docs/agdr/AgDR-0051-domain-events-and-pg-boss-job-queue.md`.

## Global Constraints

- Branch `feat/245-domain-events`, cut from `feat/245-job-queue` (PR #273). Rebase onto `main`
  once #273 merges. The PR closes nothing and references #245.
- Decided: `@Subscribe` is **class-level**, one subscriber class per file, `*.subscriber.ts`.
  Several classes may subscribe to one event.
- Decided: the subscriber rule is **documented only**, as a path-scoped rule with no ESLint
  enforcement. Revisit once PR 4's real subscribers exist.
- Matching is by exact event class (`event.constructor`), so subclasses do not reach a parent
  class's subscribers.
- No new dependency. No chart changes. No `openapi.json` change (no endpoints).
- Imports: `#src/...` / `#test/...` with `.js` extensions, never relative. Tests go in
  `tests/*.{unit,integration}.test.ts` next to the code, using `node:test` + `expect`. Stub class
  collaborators with sinon `createStubInstance` (`.claude/rules/api/tests.md`).
- Api tests: `cd apps/api && PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" pnpm test`
  (builds first). They use the default `marsa_test` DB (`docker compose up -d`). The coverage
  floors are lines 80 / branches 75 / functions 75. Never lower them.
- Lint: judge by the exit code of `rtk proxy pnpm lint`, because rtk-filtered output reports false
  errors.
- Format only the files you touch: `pnpm exec prettier --write <files>`. Never run a repo-wide
  `pnpm format`.
- Comments: one line, only a non-obvious why. No JSDoc.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **One subscriber class provided by two modules.** Discovery would return two instances, so the
   subscriber would run twice and send two jobs. Discovery must throw
   `<Name> is registered as a @Subscribe subscriber more than once` (Task 1 unit test).
2. **A subscriber with no `handle()`.** It must fail at boot with
   `<Name> is a @Subscribe subscriber but has no handle() method`, not at the first emit in
   production (Task 1 unit test, which calls `onModuleInit`).
3. **A subscriber throws midway.** The original error must reach the caller unwrapped, later
   subscribers must not run, and jobs sent by earlier subscribers must roll back (Task 1 unit test
   plus Task 2 integration test).
4. **An event nobody subscribes to, or an empty array.** `emit` resolves and does nothing, because
   PR 4 emits events before every consumer exists (Task 1 unit test).
5. **An event subclass.** It is not delivered to the parent class's subscribers. This exact-class
   rule is pinned so that it can't change silently (Task 1 unit test).

## File map

```text
apps/api/src/modules/domain-events/domain-event.ts                 NEW  DomainEvent, DomainEventClass
apps/api/src/modules/domain-events/subscribe.decorator.ts          NEW  @Subscribe, DomainEventSubscriber
apps/api/src/modules/domain-events/domain-event-emitter.ts         NEW  discovery + emit
apps/api/src/modules/domain-events/domain-events.module.ts         NEW  @Global
apps/api/src/modules/domain-events/tests/domain-event-emitter.unit.test.ts         NEW
apps/api/src/modules/domain-events/tests/test-events.ts            NEW  test-only events + subscribers + module
apps/api/src/modules/domain-events/tests/domain-events.integration.test.ts         NEW
apps/api/src/app.module.ts, apps/api/src/test/test.module.ts       MOD  import DomainEventsModule
.claude/rules/api/subscriber.md                                    NEW  the subscriber rule
apps/api/.claude/CLAUDE.md                                         MOD  rules table row + feature-shape tree
```

---

### Task 1: `DomainEvent`, `@Subscribe` and `DomainEventEmitter`

**Files:**

- Create: `apps/api/src/modules/domain-events/domain-event.ts`, `subscribe.decorator.ts`,
  `domain-event-emitter.ts`
- Test: `apps/api/src/modules/domain-events/tests/domain-event-emitter.unit.test.ts`

**Interfaces:**

- Consumes: `Transaction` from `#src/modules/database/drizzle.factory.js`.
- Produces (`domain-event.ts`):

```ts
export abstract class DomainEvent<TContent extends object> {
  constructor(readonly content: TContent) {}
}

export type DomainEventClass<TContent extends object = object> = new (
  content: never,
) => DomainEvent<TContent>
```

- Produces (`subscribe.decorator.ts`):
  - `export const Subscribe = DiscoveryService.createDecorator<DomainEventClass>()`, used as
    `@Injectable() @Subscribe(MyEvent) class MySubscriber`.
  - `export interface DomainEventSubscriber<TEvent extends DomainEvent<object> = DomainEvent<object>> { handle(event: TEvent, tx: Transaction): Promise<void> }`
- Produces (`domain-event-emitter.ts`): `@Injectable() class DomainEventEmitter implements
OnModuleInit`. The constructor takes `DiscoveryService`.
  - `onModuleInit(): void` runs discovery and caches a
    `Map<DomainEventClass, DomainEventSubscriber[]>`.
  - `emit(tx: Transaction, events: readonly DomainEvent<object>[]): Promise<void>`.
  - Discovery uses `getProviders({ metadataKey: Subscribe.KEY })` +
    `getMetadataByDecorator(Subscribe, wrapper)` and skips wrappers that have no instance or no
    metadata, like `JobRegistry`. It throws:
    - `<Name> is a @Subscribe subscriber but has no handle() method`
    - `<Name> is registered as a @Subscribe subscriber more than once` (a second instance whose
      constructor matches one already found)

- [ ] **Step 1: Write the failing tests** in `domain-event-emitter.unit.test.ts`. Call
      `TestBench.setupUnitTest()` in `before`. Build the emitter over
      `createStubInstance(DiscoveryService)`: `getProviders.returns(wrappers)`, and
      `getMetadataByDecorator.callsFake((_d, w) => w.eventClass)`, where each wrapper is
      `{ instance, eventClass }`. Call `onModuleInit()` before emitting. Subscribers are small classes
      that push `[name, event, tx]` onto a shared `log` array. Use a plain object cast to
      `Transaction` as the `tx`. Tests:
  - `runs every subscriber of an event with the same tx, in discovery order`: A and B subscribe to
    `OrderPlaced`. Expect `log` to equal `[['A', event, tx], ['B', event, tx]]`, and each
    `log[i][2]` to be the same `tx` object (`toBe`).
  - `runs events in the order given`: `emit(tx, [placed, shipped])`. Expect the names to be
    `['placed-sub', 'shipped-sub']`.
  - `skips subscribers of other events`: emitting `OrderPlaced` doesn't call the `OrderShipped`
    subscriber.
  - `does nothing for an event without subscribers or an empty list`: both
    `emit(tx, [new Unheard({})])` and `emit(tx, [])` resolve, and `log` is `[]`.
  - `does not deliver a subclass event to the parent's subscribers`:
    `class SpecialPlaced extends OrderPlaced`. Emitting it doesn't call the `OrderPlaced`
    subscriber.
  - `propagates a subscriber's error and stops later subscribers`: A throws
    `new Error('boom')` and B comes after it. `await expect(emitter.emit(tx, [placed])).rejects.toThrow('boom')`,
    the rejection is the same `Error` instance, and B is absent from `log`.
  - `rejects a subscriber without handle() at init`: `expect(() => emitter.onModuleInit()).toThrow(/has no handle\(\) method/)`.
  - `rejects a subscriber class discovered twice`: two instances of the same class.
    `toThrow(/registered as a @Subscribe subscriber more than once/)`.

- [ ] **Step 2: Run** `cd apps/api && PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" pnpm test`.
      Expected: FAIL, because the module `#src/modules/domain-events/domain-event-emitter.js` is
      not found.

- [ ] **Step 3: Implement** the three files per Interfaces. Look up subscribers with
      `map.get(event.constructor as DomainEventClass) ?? []`. Use sequential `for … of` + `await`,
      not `Promise.all`.

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(#245): add DomainEvent, @Subscribe and DomainEventEmitter`.

---

### Task 2: `DomainEventsModule`, the atomicity proof, and the subscriber rule

**Files:**

- Create: `apps/api/src/modules/domain-events/domain-events.module.ts`
- Create: `apps/api/src/modules/domain-events/tests/test-events.ts`,
  `tests/domain-events.integration.test.ts`
- Modify: `apps/api/src/app.module.ts` and `apps/api/src/test/test.module.ts`, adding
  `DomainEventsModule` right after `JobQueueModule`
- Create: `.claude/rules/api/subscriber.md`
- Modify: `apps/api/.claude/CLAUDE.md`

**Interfaces:**

- Consumes: Task 1's `DomainEvent`, `Subscribe`, `DomainEventSubscriber`, `DomainEventEmitter`.
  From PR 2: `JobScheduler.send(tx, job)`, `EchoJob` + `calls` + `TestJobsModule` from
  `#src/modules/jobs/tests/test-jobs.js`, `drainJobs(app)` from `#test/jobs/drain-jobs.js`,
  `PG_BOSS`, `boss.findJobs(queue)`, `TestBench.setupModuleTest(module)`, and `setup.teardown()`.
- Produces: `DomainEventsModule`, which is
  `@Global() @Module({ imports: [DiscoveryModule], providers: [DomainEventEmitter], exports: [DomainEventEmitter] })`.
- Produces (`test-events.ts`):
  - `TestEvent extends DomainEvent<{ n: number }>`, with `SendsEchoSubscriber` (`@Subscribe(TestEvent)`,
    which injects `JobScheduler` and runs `scheduler.send(tx, new EchoJob(event.content))`).
  - `FailingEvent extends DomainEvent<{ n: number }>`, with two subscribers registered in this order:
    `SendsEchoOnFailingSubscriber` sends `EchoJob(event.content)`, then `ThrowingSubscriber` throws
    `new Error('subscriber failed')`.
  - `TestDomainEventsModule`, which is `@Module({ imports: [TestJobsModule], providers: [...the three subscribers] })`.

- [ ] **Step 1: Write the failing integration tests** in `domain-events.integration.test.ts`.
      Mirror `job-queue.integration.test.ts`: in `before`, call
      `setup = await TestBench.setupModuleTest(TestDomainEventsModule)` and get `DATABASE`,
      `PG_BOSS` and `DomainEventEmitter`. In `afterEach`, call `setup.teardown()` and clear
      `calls`. Tests:
  - `runs a subscriber's job after the transaction commits`:
    `db.transaction((tx) => emitter.emit(tx, [new TestEvent({ n: 1 })]))`, then `drainJobs(setup.app)`.
    Expect `calls['test-echo']` to equal `[{ n: 1 }]`.
  - `leaves no job when the caller rolls back after emitting`: emit `TestEvent({ n: 2 })`, then
    throw `new Error('rollback')` in the same transaction. The transaction rejects with
    `'rollback'`, `boss.findJobs('test-echo')` is `[]`, and after `drainJobs`,
    `calls['test-echo'] ?? []` is `[]`.
  - `rolls back an earlier subscriber's job when a later subscriber throws`: emitting
    `FailingEvent({ n: 3 })` in a transaction rejects with `'subscriber failed'`, and
    `boss.findJobs('test-echo')` is `[]`.

- [ ] **Step 2: Run** `cd apps/api && PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" pnpm test`.
      Expected: FAIL, because `#src/modules/domain-events/domain-events.module.js` (or
      `test-events.js`) is not found.

- [ ] **Step 3: Implement** the module, `test-events.ts`, and the two root-module imports.

- [ ] **Step 4: Run** the same command. Expected: PASS, with the coverage gate green.

- [ ] **Step 5: Document the subscriber rule.**
  - `.claude/rules/api/subscriber.md` has frontmatter `paths: ['apps/api/src/app/**/*.subscriber.ts']`,
    under 25 lines. It says:
    - The emitting feature owns `events/<name>.event.ts`.
    - The reacting feature owns `subscribers/<name>.subscriber.ts`, registered in that feature's
      module `providers`.
    - The class is `@Injectable() @Subscribe(Event)` and implements `DomainEventSubscriber<Event>`.
    - It may only read/write rows through its own feature's repositories with the given `tx`,
      and/or `JobScheduler.send(tx, …)`.
    - It never calls a runtime port, GitHub, or the registry. External calls go in a job handler.
    - A throw rolls the emitting use-case back (a 500), so throw only on a bug.
    - Events are not persisted.
  - `apps/api/.claude/CLAUDE.md`: in the rules table, add the row
    `| *.subscriber.ts | .claude/rules/api/subscriber.md |`. In the "Feature shape" tree, change
    `errors/ · enums/ · events/ · utils/` to `errors/ · enums/ · events/ · subscribers/ · utils/`.

- [ ] **Step 6: Full checks** from the repo root. Run `rtk proxy pnpm lint; echo $?`, then
      `pnpm --filter api exec tsc --noEmit`, then format the touched files and run
      `pnpm format:check`. Expected: lint exits 0, and both other commands are clean.

- [ ] **Step 7: Commit** with the message `feat(#245): add DomainEventsModule and prove subscriber jobs roll back with the caller`.

---

## Execution

| Task                              | Kind                                                                       | Implementer | Review                                                                            |
| --------------------------------- | -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| 1. Event / decorator / emitter    | judgment (discovery, duplicate detection, error propagation)               | Sonnet      | Sonnet reviewer                                                                   |
| 2. Module, integration proof, doc | mostly mechanical (wiring + tests spelled out; the rule text is specified) | Sonnet      | none: the integration tests and full checks verify it; the final review covers it |
| Whole branch                      | —                                                                          | —           | one Opus review at the end                                                        |
