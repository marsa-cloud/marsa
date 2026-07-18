---
id: AgDR-0040
timestamp: 2026-07-18T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#35
---

# Auto-generate OpenAPI operationId via a global operationIdFactory

> In the context of every controller hand-writing its `@ApiOperation({ operationId })` (12 endpoints, each carrying the `…V1` version suffix by memory), facing the repetition and drift risk this invites as endpoints grow, I decided to **derive `operationId` globally from the controller class name via a `SwaggerModule.createDocument` `operationIdFactory`** — `lowerFirst(ClassName − "Controller") + capitalise(uriVersion)` — and to **accept the three resulting github-app operationId renames** rather than special-casing them, to achieve zero hand-written operationIds, accepting a one-time breaking change to three internal-only operationIds (and the corresponding regenerated web contract types).

## Context

Each controller set its own `operationId` (e.g. `@ApiOperation({ operationId: 'getApiInfoV1' })`). The convention was undocumented-per-endpoint: strip `Controller`, camel-case, append `V<version>`. `@nestjs/swagger@11.4.4` passes the URI version as the third arg to `operationIdFactory` (`(controllerKey, methodKey, version) => string`; with the default `v` prefix the value arrives as `v1`), and every controller is a single-endpoint CQRS unit whose method is always `handle` — so the class name alone deterministically identifies the operation. The natural seam is `apps/api/src/modules/swagger/create-open-api-document.ts`, shared by both the `generate:openapi` script and the OpenAPI e2e test.

Nine of twelve operationIds derive **byte-identically** from the class name. Three github-app endpoints did not — their hand-written IDs injected a `GithubApp` infix absent from the class name:

| Controller class | Derived (factory) | Former hand-written |
|---|---|---|
| `GetManifestController` | `getManifestV1` | `getGithubAppManifestV1` |
| `ConvertManifestController` | `convertManifestV1` | `convertGithubAppManifestV1` |
| `CaptureInstallationController` | `captureInstallationV1` | `captureGithubAppInstallationV1` |

The web codegen (`@hey-api/openapi-ts`) names its operation-wrapper types after the operationId, so any rename regenerates those types. Crucially, the web app consumes only the **DTO schema types** (`GetManifestResponse`, `zGetManifestResponse` — named after the response DTO class, unchanged here), never the operation-wrapper types (`*V1Response`); a repo-wide grep confirmed zero hand-written references to the renamed types. The blast radius of the three renames is therefore contained to generated files inside this monorepo, with no external consumers at this stage (v0.1).

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Factory + `@OperationId()` override decorator for the 3 exceptions | No class renames; preserves the 3 external IDs (satisfies the ticket non-goal) | 3 endpoints still name their operationId; extra decorator machinery |
| Factory + rename the 3 github-app controller classes | Truly zero hand-written IDs; class name always == operationId | Renames 3 classes; ripples to module registration + tests |
| **Factory only — accept the 3 ID renames (chosen)** | Simplest code; fully self-consistent (operationId always derives from class name); no override path, no class renames | Deliberately breaks the ticket's "no breaking-change to existing operationIds" non-goal for 3 internal-only IDs; regenerates 3 web contract types |

## Decision

Chosen: **factory only, accepting the three renames**, because the CEO explicitly selected it after being shown that the change is internal-only (no external API consumers; the web app uses the stable DTO schema types, not the renamed operation-wrapper types). This keeps the rule dead simple — one factory, one derivation, no exceptions to remember — at the cost of a contained, one-time contract change. The ticket's non-goal is knowingly overridden and this AgDR records why.

Implementation: `operationIdFactory` lives in `apps/api/src/modules/swagger/operation-id-factory.ts` (a pure `deriveOperationId` + the factory wrapper) and is wired into `createOpenApiDocument`. All 12 `@ApiOperation({ operationId })` decorators (and their now-unused imports) were removed.

## Consequences

- New endpoints get a correctly version-suffixed `operationId` with no `@ApiOperation` boilerplate.
- `GET /api/v1/status` still resolves to `getApiInfoV1`; the other 8 stable IDs are byte-identical in `openapi.json`.
- 3 github-app operationIds renamed; `apps/api/openapi.json` and `apps/web/app/api/{types,zod,index}.gen.ts` regenerated and committed together (drift-check stays green).
- Removing `@ApiOperation` also dropped the empty `"summary": ""` field from all 12 operations — benign cleanup.
- Unit tests cover the derivation; the OpenAPI e2e test asserts both a stable ID (`getApiInfoV1`) and a renamed one (`getManifestV1`) to guard the intended behavior.
- The version-suffix rationale in `apps/api/.claude/CLAUDE.md` (operationId section) is unchanged and still holds — the factory reproduces it mechanically.

## Artifacts

- Issue: marsa-cloud/marsa#35
- PR: _(this PR)_
