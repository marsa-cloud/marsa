---
id: AgDR-0040
timestamp: 2026-07-18T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#131
---

# Feature module boundary = one domain aggregate root

> In the context of `DeploymentsModule` having grown to own two aggregates (`App` and `Release`) and marsa#131 proposing to extract app-management into a dedicated module, facing the absence of a written criterion for _what defines a feature-module boundary_ (the api `CLAUDE.md` documented feature **shape** in depth but never **when to split**), I decided to adopt **"one feature module per domain aggregate root — a use-case lives with the aggregate it primarily reads or writes"**, the criterion already implicit in the upstream NestJS project template marsa descends from, to achieve a mechanical, reusable split rule that resists per-PR re-litigation, accepting that "aggregate" still needs modelling judgement at the margins (e.g. runtime-observability use-cases keyed by an app but reading deployment state).

## Context

`src/app/` is a vertical-slice layout: one folder per feature, each composing per-use-case modules. The api `CLAUDE.md` "Feature shape" section thoroughly documents what a feature looks like internally (controller/use-case/command/response/repository/tests, naming, builders, DTO validation) — but nothing said **how to decide that a cluster of use-cases deserves its own feature module**. marsa#131 forced the question: `DeploymentsModule` had accreted five use-cases spanning two entities —

| Use-case            | Primary aggregate               |
| ------------------- | ------------------------------- |
| `list-apps`         | `App`                           |
| `deploy-app`        | `Release` (deploy lifecycle)    |
| `list-app-releases` | `Release`                       |
| `get-app-health`    | deployment/runtime (Kubernetes) |
| `get-app-run-logs`  | deployment/runtime (Kubernetes) |

— and the ticket asked to pull "app-management" out. Without a recorded principle, that split (and every future one) is an ad-hoc judgement call re-argued each time.

marsa is built on an upstream NestJS project template. Its `apps/api/.claude/rules/module-structure.md` defines a feature as "a top-level domain in `src/app/[feature]/`", and its live `src/app/` (`users`, `user-preferences`, `api-key`, `roles`, `contact` as **separate** modules — `user-preferences` split out of `users` despite both being "user stuff") demonstrates the boundary is drawn on the **aggregate**, not the user-facing capability. The template never states the criterion in prose; this AgDR makes it explicit for marsa.

## Options Considered

| Option                                  | Pros                                                                                                                                                                                               | Cons                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain aggregate ownership** (chosen) | Mechanical, testable criterion ("which aggregate does this use-case read/write?"); matches the parent template's actual practice; entity + errors + events + use-cases stay cohesive; DDD-grounded | "Aggregate" needs modelling judgement at the edges (a runtime-observability query keyed by app but reading deployment state); occasionally splits things a user thinks of as one capability |
| Business capability                     | Matches the prior "one folder per business capability" wording; groups by user intent                                                                                                              | "Capability" is fuzzy and re-litigable; would have kept `users` + `user-preferences` fused, contradicting the template; a module can sprawl across entities                                 |
| REST resource / URL noun                | Simplest, most mechanical                                                                                                                                                                          | Couples module structure to URL design, not the domain; the exact trap that would misfile `get-app-run-logs` under `apps/` because the route says `app`                                     |

## Decision

Chosen: **domain aggregate ownership**. A feature module owns exactly one aggregate root — its `entities/` / `errors/` / `enums/` / `events/` and every use-case whose primary read/write target is that aggregate. A use-case lives with the aggregate it is _about_, not the route noun it is addressed by. Split a new module out when a cluster of use-cases centres on a different aggregate than the current module owns.

Applied to marsa#131: `App` management (`list-apps`, and future create/update/delete/config-app) becomes its own feature owning the `App` aggregate; `deployments/` keeps the `Release` aggregate plus the deploy/runtime use-cases. `get-app-health` and `get-app-run-logs` **stay in `deployments/`** — they read Kubernetes runtime state produced by a deployment, not the `App` record, so the aggregate they are about is the release/runtime, not `App`.

The user (CEO) was leaning toward aggregate ownership and confirmed after reviewing the upstream template precedent.

## Consequences

- `apps/api/.claude/CLAUDE.md` gains a "Feature module boundaries (when to split)" section stating the rule; the stale "Source layout" line ("one folder per business capability. Currently empty…") is corrected to name the aggregate criterion and the real features.
- marsa#131's extraction proceeds against a written rule rather than an ad-hoc call: `App` management moves into its own feature module owning the `App` aggregate.
- Future feature work has a one-line test for where a use-case belongs and when a module should split — no longer a per-PR discussion.
- Accepted cost: "aggregate" is a modelling judgement, so genuinely ambiguous cases (an entity that is arguably part of a larger aggregate) still need a call — but the rule names the question to ask, which is the reusable part.

## Amendment (marsa#131, same PR) — health/logs move to `app-management`, and the module is renamed

The original decision (§ Decision) kept `get-app-health` and `get-app-run-logs` in
`deployments/` on the reasoning that they read "Kubernetes runtime state produced by a
deployment, not the `App` record." Re-reading the code before executing the split showed
that reasoning was half-right and led to the wrong home:

- Both use-cases are **keyed on the app slug** and call `readAppHealth(ns, slug)` /
  `readRunLogs(ns, slug)`. **Neither references the `Release` entity at all** — there is
  no release identifier in either path.
- So "the aggregate this use-case is about" (the rule's own test) is the **running `App`**,
  not a `Release`. The `App`-noun route (`/apps/:slug/health`) and the true aggregate agree
  here; the original call over-applied the route-noun trap and treated "runtime" as a third
  pseudo-aggregate it is not.

Revised placement, adopted in the same PR:

| Use-case            | Renamed to               | Module                        |
| ------------------- | ------------------------ | ----------------------------- |
| `list-apps`         | `view-app-index`         | `app-management` (owns `App`) |
| `get-app-health`    | `view-app-health`        | `app-management`              |
| `get-app-run-logs`  | `view-app-logs`          | `app-management`              |
| `deploy-app`        | `deploy-app` (unchanged) | `release` (writes `Release`)  |
| `list-app-releases` | `view-release-index`     | `release` (reads `Release`)   |

`deployments/` is renamed to **`release/`** (`DeploymentsModule → ReleaseModule`), since after
the split it owns only the `Release` aggregate — naming a module after its aggregate is the
rule this AgDR established. Routes drop the `deployments/` prefix (breaking v1 change,
pre-launch, web is the sole consumer).

**On a future telemetry module:** grouping `view-app-health`/`view-app-logs` into a dedicated
observability module (e.g. `AppTelemetry`) was considered and rejected _for now_ — it would own
no aggregate root, which violates the one-aggregate-per-module rule and re-introduces the
capability-grouping this AgDR chose against. That split becomes correct only once telemetry owns
a **persisted aggregate** of its own (retained metrics, saved log queries, alert rules); until
then the reads live with the `App` aggregate.

The `create-app` / `create-release` / first-class `Deployment`-aggregate direction was also
discussed and explicitly deferred: `deploy-app` stays in `release/` (it writes a `Release`) until
a `Deployment` aggregate with its own lifecycle (redeploy / rollback / multi-env promotion) actually
exists — at which point a Deployments module owning it is justified by this same rule.

The naming vocabulary this amendment introduces (`view-<entity>-index`/`-detail`, singleton
`view-<thing>`, domain-verb actions) is recorded in `apps/api/.claude/CLAUDE.md` § "Use-case naming".

## Artifacts

- Issue: marsa-cloud/marsa#131
- PR: _(this PR)_
