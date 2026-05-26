# Web ↔ API Communication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the typed REST communication layer between `apps/web` and `apps/api` — an `@nestjs/swagger`-generated OpenAPI document as the contract, consumed in Nuxt via generated types + Zod with validation at the response boundary, proven end-to-end against the existing `/api/v1/status` endpoint.

**Architecture:** The API emits a committed `openapi.json` from a dedicated Nest bootstrap entrypoint. The web generates `types.gen.ts` + `zod.gen.ts` from it with `@hey-api/openapi-ts` (SDK plugin off). Calls go through a Nuxt plugin–provided `$api` (`$fetch.create`, base URL from runtime config); responses are validated with the generated Zod schema inside the `useAsyncData` `transform` hook. CI regenerates both artifacts and fails on drift.

**Tech Stack:** NestJS 11 + Fastify + `@nestjs/swagger`; Nuxt 4 (SPA, `ssr: false`) + `$fetch`/`useAsyncData`; `@hey-api/openapi-ts`; `zod`; Vitest + `@nuxt/test-utils`; `node:test` for the API.

**Spec:** `docs/superpowers/specs/2026-05-26-web-api-communication-design.md`

---

## File Structure

**API (`apps/api`)**

- `src/modules/status/use-cases/get-api-info/get-api-info.response.ts` — _modify_: convert the response interface to a `@nestjs/swagger`-decorated class so the schema is emitted.
- `src/modules/status/use-cases/get-api-info/get-api-info.controller.ts` — _modify_: add `@ApiTags` + `@ApiOperation(operationId)` + `@ApiOkResponse` so the path has a clean operation id and typed 200 response.
- `src/modules/swagger/build-api-documentation.ts` — _create_: builds the `DocumentBuilder` config (title/version).
- `src/entrypoints/generate-open-api.ts` — _create_: boots `ApiModule`, mirrors prefix + versioning, writes `openapi.json`.
- `openapi.json` — _create (generated, committed)_: the contract.
- `package.json` — _modify_: add `@nestjs/swagger` dep + `generate:openapi` script.
- `src/entrypoints/tests/generate-open-api.e2e.test.ts` — _create_: asserts the generated document contains the `/status` path with the expected operation id and response schema.

**Web (`apps/web`)**

- `openapi-ts.config.ts` — _create_: hey-api config (typescript + zod plugins, no SDK), input = the API's `openapi.json`.
- `app/api/types.gen.ts`, `app/api/zod.gen.ts` — _create (generated, committed)_.
- `app/plugins/api.ts` — _create_: provides `$api` (`$fetch.create`) with base URL from runtime config.
- `app/composables/useApiStatus.ts` — _create_: fetches `/v1/status` via `$api` and validates with the generated Zod schema in `transform`.
- `app/composables/__tests__/useApiStatus.spec.ts` — _create_: component-env test; valid payload resolves, malformed payload rejects.
- `nuxt.config.ts` — _modify_: add `runtimeConfig.public.apiBase`.
- `eslint.config.mjs` — _modify_: ignore generated `app/api/**`.
- `package.json` — _modify_: add `zod` + `@hey-api/openapi-ts` + `generate:api` script.

**Root**

- `pnpm-workspace.yaml` — _modify_: catalog entries for `@nestjs/swagger`, `zod`, `@hey-api/openapi-ts`.
- `.prettierignore` — _create or modify_: ignore generated client files.
- `.github/workflows/ci.yml` — _modify_: add a "generate + drift check" step.

---

## Task 1: Add dependency versions to the pnpm catalog

**Files:**

- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Add catalog entries**

In `pnpm-workspace.yaml`, under the `# NestJS (api)` block add `@nestjs/swagger`, and add a new web/codegen block. Use these versions (verify they are the latest on npm when installing; bump if newer majors exist, but keep within the shown major):

```yaml
# NestJS (api)
'@nestjs/common': ^11.0.1
'@nestjs/core': ^11.0.1
'@nestjs/platform-express': ^11.0.1
'@nestjs/swagger': ^11.2.0
'@nestjs/cli': ^11.0.0
```

Add near the web blocks:

```yaml
# Web ↔ API contract codegen
'@hey-api/openapi-ts': ^0.64.0
zod: ^3.24.0
```

- [ ] **Step 2: Commit**

```bash
git add pnpm-workspace.yaml
git commit -m "build: add swagger, hey-api, zod to pnpm catalog"
```

---

## Task 2: Convert the API status response to a decorated DTO class

**Why:** The SWC build ignores the `@nestjs/swagger` CLI plugin, so schema fields must come from explicit `@ApiProperty` decorators on a class (`.swcrc` already emits decorator metadata). An exported `interface` produces no runtime schema.

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/modules/status/use-cases/get-api-info/get-api-info.response.ts`

- [ ] **Step 1: Add the dependency**

In `apps/api/package.json`, add to `dependencies` (alphabetical position near other `@nestjs/*`):

```json
    "@nestjs/swagger": "catalog:",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, `@nestjs/swagger` resolved for `api`.

- [ ] **Step 3: Convert the interface to a decorated class**

Replace the entire contents of `get-api-info.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'

export class GetApiInfoResponse {
  @ApiProperty({ type: String, example: 'marsa-api' })
  name: string

  @ApiProperty({ type: String, example: '0.0.0' })
  version: string

  @ApiProperty({ type: String, nullable: true })
  commit: string | null

  @ApiProperty({ type: String, example: 'development' })
  nodeEnv: string

  @ApiProperty({ type: Number, example: 12 })
  uptimeSeconds: number
}
```

> The service returns a plain object literal typed as `GetApiInfoResponse`; this still type-checks structurally against the class. No service change needed.

- [ ] **Step 4: Verify the API still type-checks**

Run: `pnpm --filter api typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/status/use-cases/get-api-info/get-api-info.response.ts pnpm-lock.yaml
git commit -m "feat(api): make status response a swagger-decorated DTO"
```

---

## Task 3: Annotate the status controller for a clean OpenAPI operation

**Files:**

- Modify: `apps/api/src/modules/status/use-cases/get-api-info/get-api-info.controller.ts`

- [ ] **Step 1: Add Swagger decorators**

Replace the contents of `get-api-info.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { GetApiInfoResponse } from '#src/modules/status/use-cases/get-api-info/get-api-info.response.js'
import { GetApiInfoService } from '#src/modules/status/use-cases/get-api-info/get-api-info.service.js'

@ApiTags('status')
@Controller({ path: 'status', version: '1' })
export class GetApiInfoController {
  constructor(private readonly service: GetApiInfoService) {}

  @Get()
  @ApiOperation({ operationId: 'getApiInfo' })
  @ApiOkResponse({ type: GetApiInfoResponse })
  handle(): GetApiInfoResponse {
    return this.service.execute()
  }
}
```

> Note the import of `GetApiInfoResponse` changed from `import type` to a value import — `@ApiOkResponse({ type: ... })` needs the class at runtime.

- [ ] **Step 2: Verify type-check**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/status/use-cases/get-api-info/get-api-info.controller.ts
git commit -m "feat(api): annotate status endpoint for openapi"
```

---

## Task 4: Build the OpenAPI documentation config helper

**Files:**

- Create: `apps/api/src/modules/swagger/build-api-documentation.ts`

- [ ] **Step 1: Create the helper**

```ts
import { DocumentBuilder } from '@nestjs/swagger'

export function buildApiDocumentation(version: string) {
  return new DocumentBuilder()
    .setTitle('Marsa API')
    .setDescription('Marsa PaaS HTTP API')
    .setVersion(version)
    .build()
}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/swagger/build-api-documentation.ts
git commit -m "feat(api): add openapi document builder helper"
```

---

## Task 5: Create the OpenAPI generation entrypoint and script

**Files:**

- Create: `apps/api/src/entrypoints/generate-open-api.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Create the entrypoint**

It must mirror the global prefix + URI versioning from `entrypoints/api.ts` so emitted paths match the running server. It does not need the Fastify adapter (no requests are served).

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { Logger, VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'

import { ApiModule } from '#src/modules/api/api.module.js'
import { buildApiDocumentation } from '#src/modules/swagger/build-api-documentation.js'

const OUTPUT_PATH = resolve(process.cwd(), 'openapi.json')

async function generateOpenApi(): Promise<void> {
  const app = await NestFactory.create(ApiModule, {
    logger: ['error', 'warn'],
    preview: true,
  })

  try {
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })

    const documentation = buildApiDocumentation('1.0')
    const document = SwaggerModule.createDocument(app, documentation)

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`)
    Logger.log(`Generated OpenAPI document: ${OUTPUT_PATH}`)
  } finally {
    await app.close()
  }
}

generateOpenApi().catch((error) => {
  Logger.error('Failed to generate OpenAPI document', error)
  process.exitCode = 1
})
```

> `preview: true` lets the document be built without fully initializing providers (no DB connection needed).

- [ ] **Step 2: Add the script**

In `apps/api/package.json` `scripts`, add (after `build`):

```json
    "generate:openapi": "pnpm build && node dist/src/entrypoints/generate-open-api.js",
```

- [ ] **Step 3: Generate the document**

Run: `pnpm --filter api generate:openapi`
Expected: build succeeds, then logs `Generated OpenAPI document: .../apps/api/openapi.json`, and `apps/api/openapi.json` exists.

- [ ] **Step 4: Inspect the output**

Run: `node -e "const d=require('./apps/api/openapi.json'); console.log(Object.keys(d.paths)); console.log(JSON.stringify(d.paths['/api/v1/status'].get.operationId))"`
Expected: paths include `/api/v1/status`; operationId prints `"getApiInfo"`.

- [ ] **Step 5: Commit (including the generated contract)**

```bash
git add apps/api/src/entrypoints/generate-open-api.ts apps/api/package.json apps/api/openapi.json
git commit -m "feat(api): generate committed openapi.json"
```

---

## Task 6: Smoke-test the OpenAPI generation

**Files:**

- Create: `apps/api/src/entrypoints/tests/generate-open-api.e2e.test.ts`

- [ ] **Step 1: Write the failing test**

This boots `ApiModule` the same way the entrypoint does and asserts the document shape (rather than re-running the script).

```ts
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'
import type { INestApplication } from '@nestjs/common'

import { ApiModule } from '#src/modules/api/api.module.js'
import { buildApiDocumentation } from '#src/modules/swagger/build-api-documentation.js'

describe('OpenAPI generation', () => {
  let app: INestApplication

  before(async () => {
    app = await NestFactory.create(ApiModule, { logger: false, preview: true })
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })
  })

  after(async () => {
    await app.close()
  })

  it('includes the versioned status path with a typed response', () => {
    const document = SwaggerModule.createDocument(app, buildApiDocumentation('1.0'))
    const statusGet = document.paths['/api/v1/status']?.get

    assert.ok(statusGet, 'expected /api/v1/status GET to be documented')
    assert.equal(statusGet.operationId, 'getApiInfo')

    const schemaRef = statusGet.responses['200'].content['application/json'].schema.$ref
    assert.equal(schemaRef, '#/components/schemas/GetApiInfoResponse')

    const schema = document.components.schemas.GetApiInfoResponse
    assert.deepEqual(Object.keys(schema.properties).sort(), [
      'commit',
      'name',
      'nodeEnv',
      'uptimeSeconds',
      'version',
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm --filter api test`
Expected: PASS — the new test plus the existing status e2e test all green. (The pipeline rebuilds, runs migrations, then tests.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/entrypoints/tests/generate-open-api.e2e.test.ts
git commit -m "test(api): assert openapi document shape for status"
```

---

## Task 7: Add web runtime config for the API base URL

**Files:**

- Modify: `apps/web/nuxt.config.ts`

- [ ] **Step 1: Add `runtimeConfig.public.apiBase`**

In `apps/web/nuxt.config.ts`, add a `runtimeConfig` block inside `defineNuxtConfig({ ... })` (e.g. after `ssr: false`):

```ts
  runtimeConfig: {
    public: {
      // Override at runtime with NUXT_PUBLIC_API_BASE
      apiBase: 'http://localhost:3000/api',
    },
  },
```

> The base URL includes the global `/api` prefix; call sites use version-relative paths like `/v1/status`.

- [ ] **Step 2: Verify type-check**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/nuxt.config.ts
git commit -m "feat(web): add apiBase runtime config"
```

---

## Task 8: Configure hey-api codegen (types + zod, no SDK) and generate the client

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/openapi-ts.config.ts`
- Modify: `apps/web/eslint.config.mjs`
- Create/Modify: `.prettierignore` (repo root)
- Create (generated): `apps/web/app/api/types.gen.ts`, `apps/web/app/api/zod.gen.ts`

- [ ] **Step 1: Add web dependencies**

In `apps/web/package.json`, add to `dependencies`:

```json
    "zod": "catalog:",
```

add to `devDependencies`:

```json
    "@hey-api/openapi-ts": "catalog:",
```

and add to `scripts`:

```json
    "generate:api": "openapi-ts",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: `zod` and `@hey-api/openapi-ts` resolved for `web`.

- [ ] **Step 3: Create the hey-api config**

`apps/web/openapi-ts.config.ts`:

```ts
import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: '../api/openapi.json',
  output: {
    path: 'app/api',
    format: 'prettier',
  },
  // Types + Zod only. No SDK / client — calls go through Nuxt's $fetch.
  plugins: ['@hey-api/typescript', 'zod'],
})
```

- [ ] **Step 4: Generate the client artifacts**

Run: `pnpm --filter web generate:api`
Expected: creates `apps/web/app/api/types.gen.ts` and `apps/web/app/api/zod.gen.ts` (and possibly an `index.ts`). No `sdk.gen.ts` / `client.gen.ts`.

- [ ] **Step 5: Confirm the generated Zod export name**

Run: `grep -n "export const z" apps/web/app/api/zod.gen.ts`
Expected: a schema for the status response, expected name `zGetApiInfoResponse`. **Record the actual exported name** — Task 9 imports it. If it differs (hey-api derives it from the `getApiInfo` operation id), use the actual name everywhere it appears in Task 9.

- [ ] **Step 6: Ignore generated files in lint + format**

In `apps/web/eslint.config.mjs`, add `app/api/**` to the ignores. The file uses the Nuxt ESLint flat config; add an ignores entry, e.g.:

```js
// near the top-level config array
{ ignores: ['app/api/**'] },
```

Create or append to the repo-root `.prettierignore`:

```
apps/web/app/api/
apps/api/openapi.json
```

- [ ] **Step 7: Verify lint, format, and type-check are clean**

Run: `pnpm format:check && pnpm --filter web lint && pnpm --filter web typecheck`
Expected: PASS (generated files excluded from lint/format; types valid).

- [ ] **Step 8: Commit (including generated artifacts)**

```bash
git add apps/web/package.json apps/web/openapi-ts.config.ts apps/web/eslint.config.mjs .prettierignore apps/web/app/api pnpm-lock.yaml
git commit -m "feat(web): generate api types + zod from openapi (no sdk)"
```

---

## Task 9: Add the `$api` plugin and a validated `useApiStatus` composable

**Files:**

- Create: `apps/web/app/plugins/api.ts`
- Create: `apps/web/app/composables/useApiStatus.ts`

- [ ] **Step 1: Create the `$api` plugin**

`apps/web/app/plugins/api.ts` — the documented custom `$fetch` instance recipe:

```ts
export default defineNuxtPlugin(() => {
  const { apiBase } = useRuntimeConfig().public

  const api = $fetch.create({
    baseURL: apiBase,
    onResponseError({ response }) {
      console.error(`API request failed: ${response.status} ${response.url}`)
    },
  })

  return {
    provide: { api },
  }
})
```

- [ ] **Step 2: Create the composable with Zod validation in `transform`**

`apps/web/app/composables/useApiStatus.ts`. Import the generated type and the Zod schema (use the exact name recorded in Task 8 Step 5; shown here as `zGetApiInfoResponse`):

```ts
import type { GetApiInfoResponse } from '~/api/types.gen'
import { zGetApiInfoResponse } from '~/api/zod.gen'

export function useApiStatus() {
  const { $api } = useNuxtApp()

  return useAsyncData<GetApiInfoResponse>('api-status', () => $api('/v1/status'), {
    // Validate at the boundary: throws if the response drifts from the contract.
    transform: (raw): GetApiInfoResponse => zGetApiInfoResponse.parse(raw),
  })
}
```

> `~/api/*` resolves to `app/api/*` in Nuxt 4. If the generated zod schema export differs from `zGetApiInfoResponse`, substitute the real name here.

- [ ] **Step 3: Verify type-check**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/plugins/api.ts apps/web/app/composables/useApiStatus.ts
git commit -m "feat(web): add \$api plugin and validated useApiStatus composable"
```

---

## Task 10: Test the boundary validation

**Files:**

- Create: `apps/web/app/composables/__tests__/useApiStatus.spec.ts`

- [ ] **Step 1: Write the failing test**

Runs in the Nuxt environment (needs auto-imports + `useNuxtApp`). Mocks `$api` via `useNuxtApp`. First line MUST be the environment directive.

```ts
// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

import { useApiStatus } from '../useApiStatus'

const validInfo = {
  name: 'marsa-api',
  version: '0.0.0',
  commit: null,
  nodeEnv: 'test',
  uptimeSeconds: 12,
}

const apiMock = vi.fn()

mockNuxtImport('useNuxtApp', () => {
  return () => ({ $api: apiMock })
})

describe('useApiStatus', () => {
  it('returns parsed data for a valid response', async () => {
    apiMock.mockResolvedValueOnce(validInfo)

    const { data, error } = await useApiStatus()

    expect(error.value).toBeNull()
    expect(data.value).toEqual(validInfo)
  })

  it('errors when the response violates the contract', async () => {
    apiMock.mockResolvedValueOnce({ ...validInfo, uptimeSeconds: 'not-a-number' })

    const { error } = await useApiStatus()

    expect(error.value).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS — valid payload resolves with parsed data; malformed payload surfaces an error (Zod `.parse` throws inside `transform`, captured by `useAsyncData` as `error`).

> If `useAsyncData` requires a Nuxt app instance the mock doesn't supply, switch the test to call the `transform`/parse path directly: assert `zGetApiInfoResponse.parse(validInfo)` returns the object and `() => zGetApiInfoResponse.parse({ ...validInfo, uptimeSeconds: 'x' })` throws. Keep whichever form runs green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/composables/__tests__/useApiStatus.spec.ts
git commit -m "test(web): verify zod boundary validation for api status"
```

---

## Task 11: Add the CI drift check

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a generate + drift-check step**

Insert this step after "Install dependencies" (line ~50) and before "Format check", so a stale committed contract fails fast:

```yaml
- name: Verify generated API contract is in sync
  run: |
    pnpm --filter api generate:openapi
    pnpm --filter web generate:api
    if ! git diff --exit-code -- apps/api/openapi.json 'apps/web/app/api'; then
      echo "::error::Generated API contract is out of date. Run 'pnpm --filter api generate:openapi && pnpm --filter web generate:api' and commit the result."
      exit 1
    fi
```

- [ ] **Step 2: Reproduce the check locally**

Run:

```bash
pnpm --filter api generate:openapi && pnpm --filter web generate:api && git diff --exit-code -- apps/api/openapi.json apps/web/app/api && echo "IN SYNC"
```

Expected: prints `IN SYNC` with no diff (artifacts already committed and current).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: verify web/api generated contract is in sync"
```

---

## Task 12: Final full-suite verification

- [ ] **Step 1: Run the whole pipeline as CI will**

Run:

```bash
pnpm install --frozen-lockfile \
  && pnpm format:check \
  && pnpm lint \
  && pnpm --filter api typecheck \
  && pnpm --filter web typecheck \
  && pnpm build:web \
  && pnpm --filter api test \
  && pnpm --filter web test
```

Expected: every step PASS.

- [ ] **Step 2: Confirm the contract is committed and clean**

Run: `git status --porcelain`
Expected: empty (no uncommitted generated changes).
