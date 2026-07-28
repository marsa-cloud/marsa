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

## Artifacts

- Ticket: marsa-cloud/marsa#132
- PR: marsa-cloud/marsa#163
- Commits: `2a2268a` (reshape), `a318d89` (review findings), `f5b1634` (keyset response as a class)
