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
@Roles(UserRole.Operator, UserRole.Member)
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

## Every route declares its access

```ts
// WRONG — no decorator. This is not "open", it is closed to everyone, including operators.
@Get()
handle() {}

// RIGHT — name the roles admitted, and say so in the contract
@Get()
@Roles(UserRole.Operator, UserRole.Member)
@ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
@ApiOkResponse({ type: ViewAppIndexResponse })
@ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
@ApiUnauthorizedResponse({ description: 'No active session.' })
handle() {}

// RIGHT — reachable by anyone, signed in or not
@Get()
@Public()
handle() {}
```

A `@Roles(...)` route carries three contract decorators with it: `@ApiCookieAuth` (declares the
session cookie the guards require), `@ApiForbiddenResponse` (the guards can 403), and
`@ApiUnauthorizedResponse` (they can 401). Without them `openapi.json` advertises the endpoint
as unauthenticated and the generated web client has no typed error — the guard behaviour and
the published contract silently disagree. The scheme name is exported from
`#src/modules/swagger/build-api-documentation.js`; it is declared per route rather than as a
root requirement because Nest has no decorator that clears an inherited one, so a `@Public()`
route could not opt back out.

Why: `SessionAuthGuard` and `RolesGuard` are both global. A route is either `@Public()`, or it
requires a session and admits exactly the roles it names — there is no implicit default, and a
route that names none admits nobody. Write the roles out in full rather than behind a named
set; the list is short and stays translatable when permissions replace roles.

Put both decorators on the **route method, never the controller class**. `RolesGuard` resolves
`@Public()` before it looks at `@Roles(...)`, and a class-level value applies to every method —
so a class-level `@Public()` would silently beat a method-level `@Roles(...)` and ship an
unauthenticated endpoint with no log line. One route per controller makes class-level
decoration pointless anyway; keeping it on the method removes the trap.

`@Public()` means the guard chain does not apply, **not** that the endpoint is unauthenticated.
If it is reachable by the internet and does something meaningful, it needs its own verification
(a signed webhook, a single-use state token) in the use-case. See `docs/authentication.md`.

## Declare a path parameter Swagger cannot reflect

```ts
// WRONG — the branded type reflects as unknown, so the operation gets no parameter at all
handle(@Param('uuid', ParseUUIDPipe) uuid: UserUuid)

// RIGHT
@ApiParam({ name: 'uuid', required: true, format: 'uuid', type: String })
handle(@Param('uuid', ParseUUIDPipe) uuid: UserUuid)
```

Why: `@nestjs/swagger` reads the parameter's emitted design type. A plain `string` (as every
`:slug` route uses) reflects fine; a **type-only branded alias** like `UserUuid` erases to
nothing, and the operation silently ships with `"parameters": []`. The generated web client
then types the request as `path?: never` — the endpoint becomes uncallable from the frontend,
and nothing in the build or the api's own tests notices.

Rule of thumb: plain `string` param, no decorator needed; branded alias, always `@ApiParam`.
Check the regenerated `openapi.json` names every `{placeholder}` in the route.

## Inject the use-case under the name `usecase`

```ts
constructor(private readonly usecase: ViewAppIndexUseCase) {}
```

## After any controller change

Run `pnpm --filter api generate:openapi` and `pnpm --filter web generate:api`; commit both.
