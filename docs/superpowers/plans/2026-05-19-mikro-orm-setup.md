# MikroORM Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TypeORM with MikroORM in `apps/api`, wire it into the NestJS module system and test harness.

**Architecture:** A single `DatabaseModule` wraps `MikroOrmModule.forRoot()` and is registered once in `ApiModule`. Config lives in `src/sql/mikro-orm.config.ts` and is shared between the NestJS module and the MikroORM CLI. Test isolation uses a forked `EntityManager` with a transaction opened per suite and rolled back in `teardown()`.

**Tech Stack:** `@mikro-orm/core`, `@mikro-orm/postgresql`, `@mikro-orm/nestjs`, `@mikro-orm/migrations`, NestJS 11, Node 22 test runner.

---

## File Map

| Action | Path                                               | Purpose                                                      |
| ------ | -------------------------------------------------- | ------------------------------------------------------------ |
| Modify | `pnpm-workspace.yaml`                              | Add 4 MikroORM catalog entries                               |
| Modify | `apps/api/package.json`                            | Swap deps, add CLI config block, add migration scripts       |
| Create | `apps/api/.env`                                    | DB env vars for local dev                                    |
| Modify | `apps/api/.env.test`                               | Add DB env vars for test                                     |
| Delete | `apps/api/src/sql/sources/main.ts`                 | Replaced by mikro-orm.config.ts                              |
| Create | `apps/api/src/sql/mikro-orm.config.ts`             | `defineConfig()` shared by NestJS + CLI                      |
| Create | `apps/api/src/modules/database/database.module.ts` | Global NestJS wrapper around MikroOrmModule                  |
| Modify | `apps/api/src/modules/api/api.module.ts`           | Import `DatabaseModule`                                      |
| Modify | `apps/api/src/test/setup/global-setup.ts`          | Run migrations before test suite                             |
| Modify | `apps/api/src/test/setup/test-bench.ts`            | Add `orm: MikroORM` to `TestApp`; retrieve it after app boot |
| Modify | `apps/api/src/test/setup/test-setup.ts`            | Add `entityManager`, open/rollback transaction               |

---

## Task 1: Swap dependencies

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add MikroORM packages to the pnpm catalog**

In `pnpm-workspace.yaml`, add under `catalog:` (after the NestJS block):

```yaml
# MikroORM (api)
'@mikro-orm/core': ^6.0.0
'@mikro-orm/postgresql': ^6.0.0
'@mikro-orm/nestjs': ^6.0.0
'@mikro-orm/migrations': ^6.0.0
```

- [ ] **Step 2: Update `apps/api/package.json` dependencies**

Remove from `dependencies`:

```json
"@nestjs/typeorm": "^11.0.1",
"typeorm": "^1.0.0"
```

Add to `dependencies`:

```json
"@mikro-orm/core": "catalog:",
"@mikro-orm/postgresql": "catalog:",
"@mikro-orm/nestjs": "catalog:",
"@mikro-orm/migrations": "catalog:"
```

- [ ] **Step 3: Install**

```bash
pnpm install
```

Expected: lock file updated, no peer dep warnings about MikroORM.

- [ ] **Step 4: Build to confirm no broken imports**

```bash
pnpm --filter api build
```

Expected: build succeeds. TypeORM is no longer imported anywhere so removal causes no errors.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): swap typeorm for mikro-orm"
```

---

## Task 2: Add DB env vars

**Files:**

- Create: `apps/api/.env`
- Modify: `apps/api/.env.test`

- [ ] **Step 1: Create `apps/api/.env`**

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=marsa
```

- [ ] **Step 2: Add DB vars to `apps/api/.env.test`**

Current content is just `NODE_ENV=test`. Append:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=marsa_test
```

Note: use a separate database name for tests so `migration:up` in test setup doesn't touch the dev DB.

- [ ] **Step 3: Commit**

```bash
git add apps/api/.env apps/api/.env.test
git commit -m "chore(api): add DB env vars"
```

---

## Task 3: Create MikroORM config file

**Files:**

- Delete: `apps/api/src/sql/sources/main.ts`
- Create: `apps/api/src/sql/mikro-orm.config.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Delete the old TypeORM DataSource file**

```bash
rm apps/api/src/sql/sources/main.ts
rmdir apps/api/src/sql/sources 2>/dev/null || true
```

- [ ] **Step 2: Create `apps/api/src/sql/mikro-orm.config.ts`**

```typescript
import { UnderscoreNamingStrategy } from '@mikro-orm/core'
import { defineConfig } from '@mikro-orm/postgresql'

export default defineConfig({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  dbName: process.env.DB_NAME ?? 'marsa',
  namingStrategy: UnderscoreNamingStrategy,
  migrations: {
    path: 'dist/src/sql/migrations',
    pathTs: 'src/sql/migrations',
  },
  entities: ['dist/src/**/*.entity.js'],
  entitiesTs: ['src/**/*.entity.ts'],
})
```

- [ ] **Step 3: Add CLI config block and migration scripts to `apps/api/package.json`**

Add a top-level `"mikro-orm"` key (not inside `scripts`):

```json
"mikro-orm": {
  "useTsNode": false,
  "configPaths": ["./dist/src/sql/mikro-orm.config.js"]
}
```

Add to `"scripts"`:

```json
"migration:create": "mikro-orm migration:create",
"migration:up": "mikro-orm migration:up",
"migration:down": "mikro-orm migration:down"
```

- [ ] **Step 4: Build and verify the config compiles**

```bash
pnpm --filter api build
```

Expected: `dist/src/sql/mikro-orm.config.js` exists in the output.

```bash
ls apps/api/dist/src/sql/mikro-orm.config.js
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sql/ apps/api/package.json
git commit -m "feat(api): add mikro-orm config"
```

---

## Task 4: Create DatabaseModule and wire into ApiModule

**Files:**

- Create: `apps/api/src/modules/database/database.module.ts`
- Modify: `apps/api/src/modules/api/api.module.ts`

- [ ] **Step 1: Create `apps/api/src/modules/database/database.module.ts`**

```typescript
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Global, Module } from '@nestjs/common'

import config from '#src/sql/mikro-orm.config.js'

@Global()
@Module({
  imports: [MikroOrmModule.forRoot(config)],
  exports: [MikroOrmModule],
})
export class DatabaseModule {}
```

`@Global()` makes `MikroORM` and `EntityManager` available everywhere without re-importing `DatabaseModule`.

- [ ] **Step 2: Import `DatabaseModule` in `apps/api/src/modules/api/api.module.ts`**

```typescript
import { MiddlewareConsumer, Module } from '@nestjs/common'

import { AppModule } from '#src/app.module.js'
import { DatabaseModule } from '#src/modules/database/database.module.js'
import { StatusModule } from '#src/modules/status/status.module.js'

@Module({
  imports: [AppModule.forRoot([DatabaseModule, StatusModule])],
})
export class ApiModule {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configure(_consumer: MiddlewareConsumer): void {
    //TODO: Apply auth middleware
  }
}
```

- [ ] **Step 3: Build**

```bash
pnpm --filter api build
```

Expected: succeeds. If you see a `Cannot find module` error, confirm `#src/sql/mikro-orm.config.js` is in `dist/`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/
git commit -m "feat(api): add DatabaseModule with mikro-orm"
```

---

## Task 5: Update global-setup to run migrations

**Files:**

- Modify: `apps/api/src/test/setup/global-setup.ts`

- [ ] **Step 1: Replace `global-setup.ts` with migration runner**

The current file has a stub `compileTestModule` call that does nothing. Replace it entirely:

```typescript
import { MikroORM } from '@mikro-orm/core'

import config from '#src/sql/mikro-orm.config.js'

async function globalTestSetup(): Promise<void> {
  const orm = await MikroORM.init(config)
  await orm.getMigrator().up()
  await orm.close()
  console.log('Global setup completed')
}

void globalTestSetup()
```

This boots MikroORM directly (not via NestJS), runs all pending migrations against the test DB, then closes the connection.

- [ ] **Step 2: Delete `compile-test-module.ts`** — it was only used in `global-setup.ts` and is now dead code.

```bash
rm apps/api/src/test/setup/compile-test-module.ts
```

- [ ] **Step 3: Build**

```bash
pnpm --filter api build
```

- [ ] **Step 4: Run tests to verify the e2e test still passes**

```bash
pnpm --filter api test
```

Expected: global setup runs migrations (0 migrations pending on a fresh DB is fine — `migrator.up()` is a no-op when there's nothing to run), then the `GET /api/v1/status` test passes.

If migrations fail because the test DB doesn't exist yet, create it:

```bash
psql -U postgres -c "CREATE DATABASE marsa_test;"
```

Then rerun.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/test/setup/global-setup.ts
git rm apps/api/src/test/setup/compile-test-module.ts
git commit -m "feat(api): run mikro-orm migrations in test global setup"
```

---

## Task 6: Wire MikroORM into TestBench and TestSetup

**Files:**

- Modify: `apps/api/src/test/setup/test-bench.ts`
- Modify: `apps/api/src/test/setup/test-setup.ts`

- [ ] **Step 1: Update `TestApp` interface and `initApp` in `test-bench.ts`**

```typescript
import { after } from 'node:test'

import { MikroORM } from '@mikro-orm/core'
import { DynamicModule, Type, VersioningType } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, TestingModule } from '@nestjs/testing'
import qs from 'qs'

import { AppModule } from '#src/app.module.js'
import { ApiModule } from '#src/modules/api/api.module.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

after(async () => await TestBench.teardown())

export interface TestApp {
  app: NestFastifyApplication
  testModule: TestingModule
  orm: MikroORM
}

export class TestBench {
  private static _apps: Map<Type<unknown> | DynamicModule, TestApp> = new Map()
  private static _isUnitTestSetup: boolean = false

  static async setupEndToEndTest(): Promise<TestSetup> {
    return this.setupIntegrationTest(ApiModule)
  }

  static async setupModuleTest(module: Type<unknown> | DynamicModule): Promise<TestSetup> {
    return await TestBench.setupIntegrationTest(AppModule.forRoot([module]))
  }

  static async setupIntegrationTest(module: Type<unknown> | DynamicModule): Promise<TestSetup> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('NODE_ENV must be set to test')
    }

    this.setupUnitTest()

    const app = await this.initApp(module)
    return TestSetup.create(app)
  }

  static setupUnitTest(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('NODE_ENV must be set to test')
    }

    if (!this._isUnitTestSetup) {
      this._isUnitTestSetup = true
    }
  }

  static async teardown(): Promise<void> {
    for (const app of this._apps.values()) {
      await app.app.close()
    }
  }

  private static async initApp(module: Type<unknown> | DynamicModule): Promise<TestApp> {
    const moduleKey = module
    const existingApp = this._apps.get(moduleKey)

    if (existingApp) {
      return existingApp
    }

    const testModuleBuilder = Test.createTestingModule({ imports: [module] })
    const testModule = await testModuleBuilder.compile()
    const app = await this.createApp(testModule)
    const orm = testModule.get(MikroORM)
    const testApp: TestApp = { app, testModule, orm }
    this._apps.set(moduleKey, testApp)
    return testApp
  }

  private static async createApp(testModule: TestingModule): Promise<NestFastifyApplication> {
    const adapter = new FastifyAdapter({
      routerOptions: {
        querystringParser: (str) => qs.parse(str),
        ignoreDuplicateSlashes: false,
        caseSensitive: true,
        ignoreTrailingSlash: false,
        allowUnsafeRegex: false,
      },
    })

    const app = testModule.createNestApplication<NestFastifyApplication>(adapter)

    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    return app
  }
}
```

Key changes: `orm: MikroORM` added to `TestApp`; `orm` retrieved via `testModule.get(MikroORM)` after compile; `createApp` return type made explicit.

Note: `testModule.get(MikroORM)` only works when the booted module includes `DatabaseModule` (i.e. `setupEndToEndTest` which boots `ApiModule`). For `setupModuleTest` with a feature module that doesn't include `DatabaseModule`, this call will throw. Feature tests that need the DB should include `DatabaseModule` in the modules array passed to `setupModuleTest`.

- [ ] **Step 2: Update `TestSetup` in `test-setup.ts`**

```typescript
import { EntityManager } from '@mikro-orm/core'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { TestingModule } from '@nestjs/testing'
import { Server } from 'http'

import { TestApp } from '#src/test/setup/test-bench.js'

export class TestSetup {
  static async create(app: TestApp): Promise<TestSetup> {
    const em = app.orm.em.fork()
    const setup = new TestSetup(app.app, app.testModule, em)
    await setup.initialize()
    return setup
  }

  private constructor(
    public readonly app: NestFastifyApplication,
    public readonly testModule: TestingModule,
    public readonly entityManager: EntityManager,
  ) {}

  private async initialize(): Promise<void> {
    await this.entityManager.begin()
  }

  public async teardown(): Promise<void> {
    await this.entityManager.rollback()
  }

  public get httpServer(): Server {
    return this.app.getHttpServer()
  }
}
```

- [ ] **Step 3: Build**

```bash
pnpm --filter api build
```

- [ ] **Step 4: Run the full test suite**

```bash
pnpm --filter api test
```

Expected: `Global setup completed`, then `GET /api/v1/status` e2e test passes. The transaction is opened and rolled back cleanly even though the status test does no DB work.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/test/setup/test-bench.ts apps/api/src/test/setup/test-setup.ts
git commit -m "feat(api): wire mikro-orm into test harness with transaction isolation"
```
