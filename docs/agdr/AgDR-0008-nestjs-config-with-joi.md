---
id: AgDR-0008
timestamp: 2026-06-08T15:05:56Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
---

# Configuration via `@nestjs/config` + Joi — feature-scoped, validated, replacing the hand-rolled config injectable

> In the context of cleaning up the GitHub App provisioning slice (#58, [AgDR-0006](AgDR-0006-github-app-credential-storage.md)), facing a hand-rolled `@Injectable() GitHubAppConfig` that reads `process.env` directly with only a presence check — one of seven ad-hoc `process.env` reads scattered across `apps/api` — we decided to adopt **`@nestjs/config` with a `registerAs('githubApp')` namespaced config validated by a **Joi** schema at boot**, injected via the typed `ConfigType` token through `ConfigModule.forFeature`, with `ConfigModule.forRoot({ isGlobal: true })` enabled once at the composition root, accepting that this PR migrates **only** the github-app namespace and that a global env-validation schema plus the remaining six `process.env` reads are a deferred follow-up.

## Context

- `apps/api/src/app/github-app/github-app.config.ts` is a hand-rolled `@Injectable()` class: a `required()` helper throws on a missing env var, and getters concatenate URLs. It validates **presence only** (not shape), reinvents what `@nestjs/config` provides, and is the kind of bespoke plumbing the team would rather not maintain.
- It is not isolated: `grep process.env` across `apps/api/src` returns **7 reads in 5 files** — `mikro-orm.config.ts` (`DATABASE_URL`, `DB_NAME`), `crypto/secret-cipher.service.ts` + `state-signer.ts` (`APP_SECRETS_ENCRYPTION_KEY`), `status/get-api-info.service.ts` (`VERSION`, `COMMIT`, `NODE_ENV`), `entrypoints/api.ts` (`PORT`), `swagger` (`VERSION`). Config access is fragmented.
- `@nestjs/config` is **not** yet a dependency. `zod` **is** catalogued (`^3.25.76`, used by `apps/web`); `joi` and `class-validator` are absent.
- Env is loaded via Node's `--env-file` (`.env` / `.env.test`), so `process.env` is already populated before Nest boots — no `dotenv` loader needed from `@nestjs/config`, only its namespacing + validation + DI integration.
- The fix should not balloon into a whole-api config migration on a feature PR scoped to #58.

## Options Considered

| Decision           | Options                                                                                                       | Chosen                 | Why                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config mechanism   | (a) keep hand-rolled injectable; (b) plain pure functions; (c) `@nestjs/config` `registerAs` + `forFeature`   | **(c)**                | The first-class NestJS idiom: typed (`ConfigType`), namespaced, DI-integrated, validated, fail-fast at boot. (a) reinvents it; (b) loses boot-time validation + DI.                                           |
| Validation library | (a) Joi; (b) Zod; (c) class-validator                                                                         | **(a) Joi**            | Operator's call. The `@nestjs/config` docs' canonical `validationSchema` library; battle-tested for env. (New dep — Zod was the lower-cost option since already catalogued, but Joi was chosen deliberately.) |
| Validation scope   | (a) global schema over all env at `forRoot`; (b) feature-scoped, validate the namespace's vars in its factory | **(b) feature-scoped** | Keeps #58's blast radius to the github-app slice. A global schema would force migrating all 7 reads + 5 files in this PR.                                                                                     |
| Root wiring        | (a) no `forRoot` (rely on `forFeature` only); (b) `forRoot({ isGlobal: true })` once                          | **(b)**                | One-line composition-root touch; the idiomatic base `forFeature` expects, and the seam where the global schema later lands. No global schema added yet.                                                       |

## Decision

- Add **`@nestjs/config`** (`catalog:`, `^4.x` for Nest 11) and **`joi`** (`catalog:`, `^17.x`) to the catalog + `apps/api` deps.
- Rewrite `github-app.config.ts` as a namespaced config: `export const githubAppConfig = registerAs('githubApp', () => { …Joi-validate the two MARSA_* vars, then derive webhook/redirect/oauth URLs… })`, plus `export type GitHubAppConfig = ConfigType<typeof githubAppConfig>`. Joi validation throws at boot on a missing or non-URI value (strictly stronger than the old presence check).
- Enable `ConfigModule.forRoot({ isGlobal: true })` at the composition root (`AppModule`); the github-app feature module imports `ConfigModule.forFeature(githubAppConfig)`.
- `GetManifestService` injects `@Inject(githubAppConfig.KEY) private readonly config: GitHubAppConfig` instead of the old class. Unit tests construct the service with a plain config object — no `new GitHubAppConfig()`.
- Remove `GitHubAppConfig` from `GitHubAppSharedModule` providers/exports.

## Consequences

- **Stronger validation, same fail-fast.** Joi checks URI shape, not just presence; the factory runs at module init so a bad `MARSA_*` value still fails at boot.
- **Two new dependencies.** `@nestjs/config` is a near-given for a growing NestJS app; `joi` is a second validation lib in a monorepo whose web side uses Zod — a deliberate divergence (api ≠ web stack symmetry is not a tiebreaker per the api CLAUDE.md). Revisit if the global schema ever wants to share Zod with the FE.
- **Partial migration.** The other six `process.env` reads remain ad-hoc after this PR. **Follow-up ticket**: add a global Joi `validationSchema` at `forRoot` and migrate `SecretCipher`, `mikro-orm.config`, `status`, and the entrypoint reads onto namespaced config.
- **Testing.** Service unit tests get simpler (plain object injection). The old `github-app.config.unit.test.ts` (which `new`-ed the class) is replaced by a test asserting the `registerAs` factory derives + validates correctly.

## Artifacts

- Issue: marsa-cloud/marsa#58 (this feature)
- Related: [AgDR-0006](AgDR-0006-github-app-credential-storage.md) (introduced the `GitHubAppConfig` this supersedes), [AgDR-0001](AgDR-0001-web-api-communication.md) (web uses Zod; api now diverges to Joi)
- Follow-up: global env-validation schema + migrating the remaining `process.env` reads (ticket to be filed)
