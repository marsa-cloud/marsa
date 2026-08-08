---
paths:
  - 'apps/api/src/app/**/*.response.ts'
---

# Response DTOs

A response DTO is the OpenAPI contract. `apps/web` generates its types and Zod schemas
from it, so a shape that emits no schema breaks the frontend build.

## Return a constructed instance

```ts
// WRONG
return { apps: apps.map(toSummary) } as ViewAppIndexResponse

// RIGHT
return new ViewAppIndexResponse(apps, baseDomain)
```

Why: the cast produces no `@ApiProperty` metadata, so `openapi.json` emits no schema and
the web generator has nothing to type against. Field-by-field mutation after construction
has the same problem.

## Take the entity, not exploded fields

```ts
// WRONG
constructor(slug: string, image: string, createdAt: string, updatedAt: string) {}

// RIGHT
constructor(app: App, baseDomain: string) {
  this.slug = app.slug
  this.image = app.image
  this.url = `https://${app.slug}.${baseDomain}`
  this.createdAt = app.createdAt.toISOString()
}
```

Why: a positional list of same-typed strings is trivially mis-ordered at the call site,
and every added column changes the signature.

## Give a nested object its own decorated class

```ts
// WRONG
interface AppSummary {
  slug: string
}
@ApiProperty() readonly apps: AppSummary[]

// RIGHT
export class AppSummary {
  @ApiProperty({ type: String, example: 'my-app' }) readonly slug: string
}
@ApiProperty({ type: [AppSummary] }) readonly apps: AppSummary[]
```

Why: an `interface` is erased at runtime. The SWC build ignores the `@nestjs/swagger` CLI
plugin, so only explicit decorators on a **class** produce a schema.

## Use the enum's co-located decorator

```ts
// WRONG
@ApiProperty({ enum: DeployStatus })
readonly deployStatus: DeployStatus

// RIGHT
@DeployStatusApiProperty({ example: DeployStatus.Succeeded })
readonly deployStatus: DeployStatus
```

Why: a bare `@ApiProperty({ enum })` without `enumName` makes the web generator emit an
anonymous inline union instead of a named type. The decorator in `*.enum.ts` pairs them
once — see `.claude/rules/api/table.md`.

## After changing any response

Run `pnpm --filter api generate:openapi` and `pnpm --filter web generate:api`, and commit
both. CI drift-checks them.
