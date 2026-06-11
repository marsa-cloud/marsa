---
id: AgDR-0009
timestamp: 2026-06-09T14:34:15Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
---

# Request validation via `class-validator` + a global `ValidationPipe` — DTO-declared rules, manual use-case guards retained

> In the context of the GitHub App provisioning slice (#58, PR #64) where request bodies reach use-cases with **no framework-level validation** — `ConvertManifestCommand` carries only `@ApiProperty` doc decorators and the use-case re-checks `typeof command.code !== 'string'` by hand — we decided to adopt **`class-validator` + `class-transformer` with a single global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`**, declaring validation rules as decorators on the request DTOs, while **retaining the manual guards inside the use-cases** as defense-in-depth (unit tests call `execute()` directly, bypassing the HTTP pipe), accepting two new dependencies and a third validation library in the monorepo (api Joi for env, class-validator for requests, web Zod).

## Context

- There is **no `ValidationPipe`** registered anywhere — neither in `src/entrypoints/api.ts` (prod bootstrap) nor `src/test/setup/test-bench.ts` (e2e bootstrap). A grep for `@IsString`/`@IsNotEmpty`/`@Type` across `src/` returns zero hits: the app has never validated a request body.
- `ConvertManifestCommand` (`use-cases/convert-manifest/convert-manifest.command.ts`) declares `code` / `state` with `@ApiProperty` only. The use-case (`convert-manifest.use-case.ts:26-31`) compensates with imperative `BadRequestException` guards.
- `class-validator` / `class-transformer` are **not** dependencies. `joi` was just added (AgDR-0008) for **env** validation; `zod` is catalogued for the **web** contract. Request-body validation is a distinct concern from env validation — `class-validator`'s decorator model is the first-class NestJS idiom (`ValidationPipe` is built into `@nestjs/common` and expects class-validator metadata).
- The prod adapter config in `entrypoints/api.ts` and the e2e adapter config in `test-bench.ts` are deliberately kept in sync (per `apps/api/.claude/CLAUDE.md`). A global pipe must be registered in **both** so e2e tests exercise the same validation as production.
- Manual guards cannot simply be deleted: the use-case unit tests construct the use-case and call `execute({ code, state })` directly, so the pipe never runs for them. Removing the guards would drop coverage of the invalid-input paths.

## Options Considered

| Decision       | Options                                                                                        | Chosen                  | Why                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validation lib | (a) `class-validator`; (b) Zod (reuse web's); (c) hand-rolled guards only                      | **(a) class-validator** | The native NestJS `ValidationPipe` consumes class-validator metadata directly. Zod would need a custom pipe; hand-rolled guards are what we're trying to retire.   |
| Pipe scope     | (a) global `app.useGlobalPipes`; (b) per-controller `@UsePipes`; (c) per-handler `@Body(pipe)` | **(a) global**          | One registration covers every current + future DTO. Per-handler scatters the policy and is forgettable on the next endpoint.                                       |
| Pipe options   | (a) defaults; (b) `whitelist + transform + forbidNonWhitelisted`                               | **(b)**                 | `whitelist` strips unknown props; `forbidNonWhitelisted` 400s on them (tighter contract for the web client); `transform` instantiates the DTO class.               |
| Manual guards  | (a) delete (pipe covers HTTP); (b) keep as defense-in-depth                                    | **(b) keep**            | Unit tests bypass the pipe; the guards are the only validation on the direct `execute()` path and document the use-case's own preconditions.                       |
| Where to wire  | (a) prod bootstrap only; (b) prod + e2e bootstraps                                             | **(b) both**            | Keeps `api.ts` and `test-bench.ts` in sync (CLAUDE.md rule) so e2e tests validate identically to prod. OpenAPI bootstrap needs no pipe (schema is `@ApiProperty`). |

## Decision

- Add **`class-validator`** and **`class-transformer`** to the `pnpm-workspace.yaml` catalog and `apps/api` `dependencies` (`catalog:` refs).
- Register `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))` in **both** `src/entrypoints/api.ts` and `TestBench.createApp` (`src/test/setup/test-bench.ts`), after prefix + versioning so the two bootstraps stay identical.
- Decorate `ConvertManifestCommand` fields with `@IsString()` + `@IsNotEmpty()` (alongside the existing `@ApiProperty`).
- **Retain** the imperative guards in `ConvertManifestUseCase.execute` — they remain the validation boundary for the direct (unit-test) call path and assert the use-case's own preconditions.
- Regenerate `openapi.json` (no schema change expected — validation decorators don't alter `@ApiProperty`-derived schemas — but run to confirm a clean drift check).

## Consequences

- **Real HTTP-layer validation.** Malformed or extra-field request bodies now 400 at the boundary instead of reaching the use-case. The web client gets a tighter, documented contract.
- **A third validation library.** api now has Joi (env) + class-validator (requests); web has Zod. Deliberate per the api CLAUDE.md "symmetry is not a tiebreaker" guidance — each tool is the ecosystem standard for its job. Revisit only if the surface area grows enough to warrant consolidation.
- **`transform: true` instantiates DTOs.** Bodies become real `ConvertManifestCommand` instances, not plain objects — harmless here, but future DTOs with methods/getters now behave as classes.
- **Guards are intentionally redundant on the HTTP path.** A reader may flag the duplication; the AgDR is the record that it's deliberate (unit-test path coverage + explicit preconditions), not an oversight.
- **Follow-up.** As more endpoints land, every request DTO should carry class-validator decorators; the global pipe already covers them with no further wiring.

## Artifacts

- Issue: marsa-cloud/marsa#58 (feature) · PR: marsa-cloud/marsa#64
- Resolves PR #64 review comment on `convert-manifest.command.ts:9` ("forgot to add class-validator/class-transformer")
- Related: [AgDR-0008](AgDR-0008-nestjs-config-with-joi.md) (Joi for env validation — the sibling validation decision), [AgDR-0006](AgDR-0006-github-app-credential-storage.md)
