---
paths:
  - 'apps/api/src/modules/runtime/**'
---

# Runtime ports and adapters

`src/modules/runtime/` is where Marsa meets whatever runs its apps. The abstract classes
(`AppRuntime`, `EnvironmentRuntime`, `NodeRuntime`) are **ports**; `adapters/<tech>/` are
**adapters**. AgDR-0046.

## Ports speak Marsa, not the runtime

```ts
// WRONG — the port leaks Kubernetes
abstract apply(namespace: string, manifests: RenderedManifests): Promise<void>

// RIGHT — the adapter decides what an environment and a deploy become
abstract deploy(app: AppRef, spec: AppDeploySpec): Promise<void>
```

Why: a port shaped like one technology can only ever have that technology behind it.

## Only an adapter imports its client library

`@kubernetes/client-node` is imported under `adapters/kubernetes/**` and nowhere else.
Rendering, namespace naming and rollout parsing live in the adapter.

## Features never import an adapter

`src/app/**` imports `#src/modules/runtime/*` only; tests may import the mock adapter to stub it.

## Refs are shapes, not mapped copies

`AppRef` / `EnvironmentRef` describe the nested `{ project, environment, app }` fields the runtime
reads, so a feature passes its `AppPlacement` (or `{ project, environment }`) as-is.

```ts
// WRONG — a mapper per feature row
await this.appRuntime.readHealth(appRefOf(placement))

// RIGHT — the row already fits the port
await this.appRuntime.readHealth(placement)
```

## Runtime errors become HTTP in one place

`RuntimeErrorFilter` (registered by `RuntimeModule`) maps `EnvironmentConflictError` to 409.
Use-cases let it propagate instead of wrapping each runtime call in a try/catch.

## Adding an adapter

One folder under `adapters/`, one `@Global()` module binding all three ports, one
`ConditionalModule.registerWhen` line in `runtime.module.ts`, one value in the
`MARSA_RUNTIME` validation in `src/config/env.config.ts`.

## A capability the runtime lacks throws

An adapter that cannot do something (scale-to-zero, node pinning) throws a clear error. Do not
remove the capability from the port to fit the weakest adapter.
