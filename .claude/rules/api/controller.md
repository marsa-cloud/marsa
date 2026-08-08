---
paths:
  - 'apps/api/src/app/**/*.controller.ts'
---

# Controllers

One controller per use-case. It injects the use-case and delegates — no logic.

## Keep it to one route method

```ts
// WRONG — a second route on the same controller
@Get() index() {}
@Get(':slug') detail() {}

// RIGHT — one route; a second endpoint gets its own use-case folder
@Get()
@UseGuards(SessionAuthGuard)
@ApiOkResponse({ type: ViewAppIndexResponse })
handle(): Promise<ViewAppIndexResponse> {
  return this.usecase.execute()
}
```

Why: the global `operationIdFactory` derives the id from the **controller class name** and
the URI version, ignoring the method key. A second route emits a duplicate `operationId` —
invalid OpenAPI, and the web generator collides.

## Never hand-write an operationId

```ts
// WRONG
@ApiOperation({ operationId: 'viewAppIndex' })

// RIGHT — nothing; ViewAppIndexController + v1 yields viewAppIndexV1
```

Why: the class name **is** the contract. Renaming a controller renames its operationId and
churns the generated web types, so treat it as a public-surface change. A hand-written id
reintroduces exactly the drift the factory removes.

## Declare the response with a class

```ts
// WRONG — an interface produces no schema
@ApiOkResponse({ type: ViewAppIndexResponseShape })

// RIGHT
@ApiOkResponse({ type: ViewAppIndexResponse })
```

See `.claude/rules/api/response-dto.md`.

## Document every error the use-case can throw

```ts
// RIGHT
@ApiOkResponse({ type: ViewAppIndexResponse })
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiNotFoundResponse({ description: 'No app with that slug.' })
```

Why: the contract should describe the real response set, not just the happy path. The web
generates its error handling from it.

## Inject the use-case under the name `usecase`

```ts
constructor(private readonly usecase: ViewAppIndexUseCase) {}
```

## After any controller change

Run `pnpm --filter api generate:openapi` and `pnpm --filter web generate:api`; commit both.
