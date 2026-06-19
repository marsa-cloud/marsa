---
id: AgDR-0018
timestamp: 2026-06-18T10:55:00Z
agent: claude
model: claude-sonnet-4-6
trigger: pr-review
status: executed
ticket: marsa-cloud/marsa#62
---

# Branded `Uuid` type for all entity primary keys and session/identifier fields

> In the context of PR #80's review (#62), facing every entity's primary key and
> every place a uuid crosses a function boundary being typed as plain `string` —
> letting any string (a slug, a github login, an empty literal) compile where a
> uuid is required — we decided to introduce a **branded `Uuid` type** with a
> runtime-validating constructor, applied across all five entities' primary keys
> and the session/identifier fields that carry them, to make uuid-shaped values
> a distinct type the compiler can check, accepting the one-time mechanical cost
> of touching every entity and the call sites that read/write `uuid`.

## Context

- `grep -n "uuid: string" apps/api/src` shows the same shape repeated five times:
  `GitHubApp.uuid`, `GitHubInstallation.uuid`, `ManifestState.uuid`,
  `OAuthState.uuid`, `Operator.uuid` — each `@PrimaryKey({ type: 'uuid' })
uuid: string = randomUUID()`. All five are structurally identical and none is
  distinguished from any other `string` at the type level.
- The session cookie (`auth-session.types.ts`) stores `operatorUuid: string` —
  the same `string` type as a github login, a URL, or any other text field
  flowing through the same controllers. A typo'd assignment (e.g. accidentally
  writing `githubLogin` into the `operatorUuid` session field) would not be
  caught by `tsc`.
- No branded/opaque type exists anywhere in the repo today — this is a new
  pattern, not an extension of an existing one.
- The repo has no shared `packages/` content yet (`packages/` is reserved,
  currently empty per the root CLAUDE.md), so a new type needs a home inside
  `apps/api` rather than a cross-package library, since `apps/web` does not deal
  in raw entity uuids (it only ever sees opaque strings over JSON).

## Options Considered

| Option                                                                                                | Pros                                                                                                                                           | Cons                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Branded type `Uuid = string & { readonly __brand: 'Uuid' }` + `asUuid()` constructor** (chosen) | Compile-time distinction from plain `string`; zero runtime overhead (erased to a string); one place (`asUuid`) to enforce shape via `isUUID()` | Construction requires going through `asUuid()` — a small ergonomic tax at every `randomUUID()` call site and at every untyped boundary (HTTP params, raw DB rows)             |
| (b) Leave `uuid: string` everywhere                                                                   | No change                                                                                                                                      | Status quo — exactly the gap that prompted this AgDR                                                                                                                          |
| (c) A real runtime class (`class Uuid { constructor(value: string) {...} }`)                          | Strongest runtime guarantee, can carry methods                                                                                                 | Heavier — every MikroORM property, every JSON response, every session-cookie field would need (de)serialization wrappers; far more invasive than the gap justifies for an MVP |

## Decision

Chosen: **(a)**.

- New file `apps/api/src/utils/uuid.ts` (per the repo's "place utility functions by reach" convention — `Uuid` is cross-cutting, not feature-local): exports `type Uuid = string & { readonly __uuidBrand: unique symbol }` and `function asUuid(value: string): Uuid` that validates with `class-validator`'s `isUUID()` (see also AgDR-0021 for `isUUID` adoption in `oauth-state.service`) and throws on a non-uuid string.
- Every entity's `@PrimaryKey` field is retyped `Uuid` (still `@Property({ type: 'uuid' })` at the MikroORM/DB level — only the TS-side type changes), initialized via `asUuid(randomUUID())`.
- `SessionData.userUuid` (the renamed field, AgDR-0019) is typed `Uuid`.
- Boundaries that receive untyped strings (route params, the session read, raw query results) call `asUuid()` once at the boundary; everything downstream carries the branded type.

## Consequences

- A future accidental assignment of a non-uuid string into a `Uuid`-typed field is now a compile error, not a runtime surprise.
- One new shared module (`apps/api/src/utils/uuid.ts`) — the repo's first branded type. Establishes the pattern other identifier-shaped strings (e.g. a future branded `GithubUserId`) could follow, but this AgDR scopes itself to `Uuid` only.
- Five entities + the session types + the affected use-case/repository signatures change in this PR. Mechanical, not behavioral — no runtime semantics change, since `Uuid` erases to `string` and the underlying column type is unchanged.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (PR #80 review response)
- Related: [AgDR-0019](AgDR-0019-user-rename-and-role-enum.md) (the rename this lands alongside), [AgDR-0021](AgDR-0021-all-octokit-client.md) (separately adopts `class-validator`'s `isUUID`, reused here as the validator)
