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
@Module({ providers: [ViewAppHealthUseCase, DeployBackend] })

// RIGHT — src/modules/kubernetes/kubernetes.module.ts owns and exports it
@Module({
  providers: [
    {
      provide: DeployBackend,
      useFactory: (config: ConfigService) =>
        config.get<string>('DEPLOY_BACKEND', 'direct') === 'mock'
          ? new MockDeployBackend()
          : new DirectApplyDeployBackend(),
      inject: [ConfigService],
    },
  ],
  exports: [DeployBackend],
})
export class KubernetesModule {}

// then, in the use-case module
@Module({ imports: [KubernetesModule], controllers: [/* … */] })
```

Why: re-listing a provider creates one instance per module. Any service holding state, a
connection, or a factory decision (here: real backend vs `MockDeployBackend` under
`NODE_ENV=test`) then behaves differently depending on who injected it.

An external service gets **one** seam — an abstract class bound by a module factory — not a
new `*Service` per feature.
