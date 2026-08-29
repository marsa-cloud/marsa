---
paths:
  - 'apps/api/src/app/**/*.service.ts'
---

# Services

A service is shared support code inside a feature. It is the exception, not a layer every
feature gets — most application logic belongs in a `<Action>UseCase`, and most data access
in a use-case-scoped `<Action>Repository`.

## Reach for one only when a use-case cannot own the code

Write a service when **either** holds:

- **Two or more use-cases would otherwise duplicate the same logic.** This is the common
  case — `OAuthStateService` is issued by begin-login and consumed by complete-login.
- **The consumer is not a use-case at all** and therefore has no slice to live in — a
  global guard, an interceptor, a scheduled job. `UserRoleService` exists because
  `RolesGuard` needs the acting user's role and a guard owns no use-case folder.

Anything else stays in the use-case that needs it.

```ts
// WRONG — one caller, and that caller is a use-case
export class ViewAppDetailFormatterService {}

// RIGHT — the use-case does its own work
export class ViewAppDetailUseCase {}
```

## Give it a directory under `services/`, and its own module

```text
src/app/<feature>/services/<service-name>/
  <service-name>.service.ts
  <service-name>.module.ts
  tests/<service-name>.db.test.ts
```

```ts
// RIGHT — user-role.module.ts
@Module({
  providers: [UserRoleService],
  exports: [UserRoleService],
})
export class UserRoleModule {}
```

Why: a service listed directly in each consumer's `providers` array is instantiated once per
module, so stubbing it in one test leaves the other live — the same trap as
`.claude/rules/api/module-wiring.md` § "Share a support service through its own exporting
module". One module, one instance, one seam.

## A service may own its data access

Unlike a use-case, a service injects `Database` directly — there is no
`<Action>Repository` for it to delegate to, and inventing one per service buys nothing.
Test it with a `.db.test.ts` (see `.claude/rules/api/tests.md`).

## Known deviations

`OAuthStateService`, `ManifestStateService`, and `GetApiInfoService` predate this rule and
sit outside `services/`. They are grandfathered, not precedent — new services follow the
layout above.
