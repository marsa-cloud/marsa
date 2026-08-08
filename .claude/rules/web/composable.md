---
paths:
  - 'apps/web/app/composables/**/*.ts'
  - 'apps/web/app/plugins/**/*.ts'
---

# API composables

Every backend call goes through the `$api` plugin (base URL + interceptors) and is validated
with the generated Zod schema at the boundary. There is no BFF — this is an SPA
(`ssr: false`), so never reach for a Nuxt server route.

## Reactive reads: `useAsyncData` + `$api`, wrapped per endpoint

```ts
// RIGHT — app/composables/useApiStatus.ts
export function useApiStatus() {
  const { $api } = useNuxtApp()
  return useAsyncData<GetApiInfoResponse>('api-status', () => $api('/v1/status'), {
    transform: (raw): GetApiInfoResponse => zGetApiInfoResponse.parse(raw),
  })
}
```

The explicit cache key is deliberate: auto-generated keys can collide silently.

## Mutations and event handlers: imperative `$api`

```ts
// WRONG — a reactive read in a click handler; Nuxt keys, caches and dedupes it
async function onSubmit() {
  const { data } = await useFetch('/v1/apps', { method: 'POST', body })
}

// RIGHT
const { $api } = useNuxtApp()
const raw = await $api('/v1/apps', { method: 'POST', body })
const app = zViewAppDetailResponse.parse(raw)
```

Why: `useAsyncData` / `useFetch` are keyed, cached, setup-scoped data loaders. Calling them
from a handler is a documented Nuxt anti-pattern — the second click can return the first
response.

## Bind to the schema body type, not the operation wrappers

```ts
// WRONG
import type { ViewAppIndexV1Response } from '~/api/types.gen'

// RIGHT
import type { ViewAppIndexResponse } from '~/api/types.gen'
```

Why: `…V1Response`, `…V1Responses`, and `…V1Data` are hey-api plumbing (a response union, a
status-code map, and the request shape). The schema body type is the payload.

## Keep composables flat and top-level

Only files directly in `app/composables/` are auto-scanned. A composable nested in a
subdirectory silently fails to auto-import unless re-exported from an `index.ts`.

## Never hand-edit `app/api/*`

Regenerate with `pnpm --filter web generate:api` after the api's `openapi.json` changes, and
commit the result. CI drift-checks it.
