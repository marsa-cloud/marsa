---
id: AgDR-0040
timestamp: 2026-07-20T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#132
---

# Pagination primitives are a declaration-only contract; the implementor owns the seek logic

> In the context of the pagination primitives added under `apps/api/src/utils/pagination/`, facing a first implementation that centralised cursor encoding, keyset seek-predicate construction and over-fetch page assembly, I decided to **reduce the primitives to DTO shape declarations plus a single offset mapper, and hand cursor and seek mechanics to each adopting repository**, to achieve a smaller and more predictable surface, accepting that every keyset adopter now re-implements cursor encoding and the seek predicate — including the off-by-one that centralised assembly used to prevent.

## Context

The first cut of GH-132 shipped three modules of working logic beyond the DTOs:

- `cursor.ts` — base64url encode/decode of a `{ sortValue, id }` payload, with `BadRequestException` on malformed input
- `keyset-comparison.ts` — an ORM-neutral descriptor of the `seek past the cursor` predicate, carrying the `orderBy` the predicate presupposes
- `build-keyset-page.ts` — page assembly from an over-fetched `limit + 1` row set, building `nextCursor` from the last row _returned_ rather than the last row _fetched_

An external reference package (`@wisemen/pagination`) solves the same problem with declarations only: it declares an opaque keyset `key` and leaves encoding, seeking and assembly to each consumer. The team asked to converge on that shape.

Two facts shaped the decision and are worth recording, because they cut against a naive "the reference is the better design" reading:

1. The reference package ships **zero tests**. Several defects we found during this work exist there identically and unobserved — an offset clamp that bounds only the ceiling (`0`, negatives and `NaN` pass through to the driver), a response constructor whose loose overload takes `(total, limit, offset)` while its meta constructor takes `(total, offset, limit)`, a `KeysetDirection` enum with no query field able to carry it, and a Swagger `minimum: 0` contradicting `@IsPositive()`.
2. Marsa's environment is stricter: `forbidNonWhitelisted: true` on the global pipe, MikroORM (whose exported `FilterQuery<T>` collides with the reference's `FilterQuery`), `strict` TypeScript, and a committed `openapi.json` that `apps/web` turns into a typed client.

So "match the reference" was adopted as a **shape** decision, not a correctness argument, and the known defects were fixed rather than copied.

## Options Considered

| Option                                              | Pros                                                                                                                       | Cons                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Declaration-only contract** (chosen)              | Small, predictable surface; no ORM opinion baked into shared code; each repository is free to seek the way its query needs | Every keyset adopter re-implements cursor encoding and the seek predicate; the off-by-one that assembly prevented is now each adopter's to avoid |
| Keep the centralised mechanics                      | Cursor correctness solved once; the page-boundary off-by-one is structurally impossible                                    | Larger surface; the ORM-neutral descriptor still needed per-repository translation, so it removed less duplication than it appeared to           |
| Declaration-only, plus a shared keyset helper later | Smallest surface now, with a path to re-centralise once two or more real adopters show a common shape                      | Defers a decision rather than making one; risks two adopters diverging first                                                                     |

## Decision

Chosen: **declaration-only contract**, because the primitives have no adopters yet, and the centralised mechanics were designed against an imagined consumer rather than a real one. A shared helper can be reintroduced once two real keyset endpoints exist and their common shape is observable rather than assumed.

Deviations from the reference, each deliberate:

- **No barrel `index.ts`** — this is a monorepo path, not a published package
- **`mikroormPagination` replaces `typeormPagination`** — MikroORM's `FindOptions` takes `limit`/`offset` directly, so it renames nothing; it exists to clamp and supply fallbacks
- **`BaseFilterQuery`, not `FilterQuery`** — avoids a name collision with MikroORM's own `FilterQuery<T>`
- **`SearchQuery` members are concrete, not abstract** — abstract members force every subclass to redeclare them, and an undecorated redeclaration is rejected by `forbidNonWhitelisted`, producing a 400 on every request while the build and isolated unit tests stay green
- **Keyset responses are decorated classes, not interfaces** — `@ApiOkResponse({ type: X })` needs a runtime class, and keyset endpoints would otherwise emit no OpenAPI schema and no generated frontend types
- **`KeysetDirection` and the meta's `prev` were dropped** — no query field could carry a direction back, so backwards paging was advertised but not expressible

## Consequences

- Each keyset adopter owns cursor encoding/decoding and the seek predicate. The page-boundary off-by-one is a real risk; the first adopter should test it explicitly.
- `apps/api/src/utils/pagination/` holds DTO declarations plus `mikroormPagination` only. Nothing there is ORM-specific except that mapper.
- The design and plan documents that described the cursor-based approach were deleted in the same change; this record is the surviving rationale.
- If a second keyset endpoint appears, revisit whether a shared helper is now justified by observed duplication.

## Amendment (marsa-cloud/marsa#185, 2026-08-09) — three adopters landed; the helper stayed unbuilt

The record above said to _"revisit whether a shared helper is now justified"_ once a second keyset endpoint appeared. Three appeared at once (`view-app-index`, `view-release-index`, `view-user-index`). The revisit concluded **no shared assembly helper**, for a reason the original record could not see: the reference convention puts the mechanics on a **per-use-case key DTO**, not in shared code.

Each adopter declares a `<UseCase>QueryKey` with `static from(row)` and `static nextKey(rows)`. `nextKey` reads `rows.at(-1)` — the last row _returned_ — which is structurally the same guarantee the deleted `build-keyset-page.ts` provided, expressed once per use-case in three lines instead of once globally behind an abstraction over row shapes. The only thing promoted to shared code is `keysetLimit()`, a sibling of the offset clamp, for the same reason: the DTO's `@Max` guards the HTTP path but not a query object constructed in code.

Four further decisions recorded here:

- **The cursor is the `uuidv7` primary key alone.** Both `app` and `release` (and `user`) default their PK to `uuidv7()`, which is time-ordered, so `WHERE uuid < :cursor ORDER BY uuid DESC` is the whole seek and the PK index already serves it — no `(createdAt, uuid)` composite, no duplicate-timestamp handling, no new index. **The trade:** ordering by `uuid` is ordering by _insert_ order, not by the `createdAt` **value**. They agree today because both are stamped at insert; a backfill or an explicit `createdAt` write would diverge. Accepted, and recorded here so a future backfill knows it changes list order.
- **`next` is not null-on-last-page.** It is built from the last row returned and is `null` only once a page comes back empty, so a client paging an exact multiple of `limit` spends one final request that returns `[]`. This is the reference convention; the alternative — over-fetching `limit + 1` to detect the boundary — was considered and rejected as more machinery than the saved round trip is worth. The frontend's stop condition is therefore "empty page", plus a short-page shortcut.
- **The key is a structured DTO, not an opaque string.** This is what makes the cursor _typed_ end-to-end: because each response redeclares `meta` with its own decorated meta class, the generated client gets `next: ViewAppIndexQueryKey | null` instead of the base's schema-less record. The "cursor loses type safety at the boundary" gap the ticket anticipated does not exist. Redeclaring `meta` is required — inheriting it silently falls back to the opaque base schema.
- **`mikroormPagination` → `offsetPagination`.** Persistence moved to Drizzle in #107; the name outlived the ORM. `BaseFilterQuery`'s rationale comment was reworded for the same reason.

One wire-format consequence worth its own line, discovered in testing: the declared query shape is **nested** (`?pagination[limit]=20&pagination[key][uuid]=…`), and `$fetch`/`ofetch` serializes query values with `URLSearchParams`, which stringifies a nested object to `[object Object]`. The cursor silently never arrives and the list loops on page one. Clients must emit bracketed keys; `useKeysetList` does this in one small helper. Anything else calling a paginated endpoint has to do the same.

## Artifacts

- Ticket: marsa-cloud/marsa#132; amended by marsa-cloud/marsa#185
- PR: marsa-cloud/marsa#163
- Commits: `2a2268a` (reshape), `a318d89` (review findings), `f5b1634` (keyset response as a class)
- Follow-up: marsa-cloud/marsa#195 (measure whether `release` needs a composite index)
