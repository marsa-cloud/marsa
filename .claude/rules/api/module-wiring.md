---
paths:
  - 'apps/api/src/**/*.module.ts'
---

# Module wiring

Three levels: use-case module → feature module → `ApiModule`.

## A use-case module declares its own controller and providers

```ts
// RIGHT — view-app-index.module.ts
@Module({
  controllers: [ViewAppIndexController],
  providers: [ViewAppIndexUseCase, ViewAppIndexRepository],
})
export class ViewAppIndexModule {}
```

## A feature module only imports its use-case modules

```ts
// WRONG — feature module re-declares the slice's providers
@Module({ controllers: [ViewAppIndexController], providers: [ViewAppIndexUseCase] })
export class AppManagementModule {}

// RIGHT
@Module({
  imports: [ViewAppIndexModule, ViewAppDetailModule, DeleteAppModule],
})
export class AppManagementModule {}
```

Why: duplicate providers give each module its own instance, so stubbing one in a test leaves
the other live.

## Register a new feature in `ApiModule` only

`AppModule` and `TestModule` are **parallel** composition roots — `TestModule` never nests
inside `AppModule`. Global infrastructure (`DatabaseModule`, `CryptoModule`) is `@Global()`
and belongs in both directly; feature modules are passed in by the caller.

## Share a support service through its own exporting module

```ts
// WRONG — the provider re-listed in every use-case module that needs it
@Module({ providers: [ViewAppHealthUseCase, AppRuntime] })

// RIGHT — one @Global adapter module binds the port; RuntimeModule picks it on MARSA_RUNTIME
@Global()
@Module({
  providers: [{ provide: AppRuntime, useClass: MockAppRuntime }],
  exports: [AppRuntime],
})
export class MockRuntimeModule {}

// then, in the use-case module: nothing to import — inject AppRuntime
@Module({ controllers: [/* … */], providers: [ViewAppHealthUseCase] })
```

Why: re-listing a provider creates one instance per module. Any service holding state, a
connection, or a factory decision (here: the Kubernetes adapter vs the mock adapter under
`MARSA_RUNTIME=mock`) then behaves differently depending on who injected it.

An external service gets **one** seam — an abstract class bound by a module factory — not a
new `*Service` per feature.
