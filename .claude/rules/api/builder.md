---
paths:
  - 'apps/api/src/**/*.builder.ts'
---

# Builders

Every entity and every command gets a fluent builder. Tests never assemble either from an
object literal.

## Seed valid defaults in the constructor

```ts
// WRONG — every test must supply every field
export class AppBuilder {
  private readonly app = {} as App
}

// RIGHT
export class AppBuilder {
  private readonly app: App

  constructor() {
    const now = new Date()
    this.app = {
      uuid: generateUuid<AppUuid>(),
      slug: 'my-app',
      domain: { type: 'subdomain' },
      image: 'nginx:1.27',
      containerPort: 80,
      replicas: 1,
      env: {},
      imagePullCredentialsEnc: null,
      createdAt: now,
      updatedAt: now,
    }
  }
}
```

Why: `new AppBuilder().build()` must always be valid, so a test overrides only the field
under test. That is what makes the test's intent readable.

## Return `this` from every setter

```ts
// RIGHT
withSlug(slug: string): this {
  this.app.slug = slug
  return this
}

build(): App {
  return this.app
}
```

## Add a column to the table, add it to the builder — same PR

A new non-nullable column with no builder default breaks every existing test with an error
that names the column, not the cause. When you add a `withX` to one builder, check its
siblings in the same feature.
