# PR 4 async delete-app — execution progress

Branch: `feat/245-async-delete-app` (from origin/main 37e9aec).
Plan: `docs/superpowers/plans/2026-11-08-245-pr4-async-delete-app.md`.

## Done

- Task 1 (deletion state columns/enum/payload, responses `state`, migration, contract regen): `4ff1116`
- Task 2 (409 guard, AppDeletionConflictError + filter, 5 guards, receive-push skip): `1a4bb2c`
- Task 3 (DELETE → 202, AppDeletedDomainEvent, use-case rewrite, contract regen, domain-events.md rule): `bd646d4`
- Task 4 (destroy-runtime + finalize + dead-letter jobs/subscribers, app-management integration tests): `e504622`
- Task 5 (cancel-builds + delete-repository jobs/subscribers, full-chain integration tests): `be859e6`
- Task 6 (#267 build-cancel timeout fix): `eb5d23f` + `343bd0a` (dead-letter source/error surfaced in `deletion_error`)
- Task 7 (verification + docs): full api suite green — 714/714 pass, coverage lines 91.07 / branches 82.15 / functions 93.07 (floors 80/75/75 unchanged). Typecheck clean. `rtk proxy pnpm lint` exit 0. No contract drift (`openapi.json` + web `app/api` untouched). Fixed pre-existing type error in app-deletion-jobs.integration.test.ts (`ref.app.uuid` → `ref.app.slug`; `AppRef` carries no uuid). Added `jobs/<name>/` (`.job.ts` / `.job-handler.ts`) to the feature-shape tree in `apps/api/.claude/CLAUDE.md`.

## COMPLETE — PR open

PR: https://github.com/marsa-cloud/marsa/pull/278 (references #245, closes #267).
Whole-branch review: no blockers; follow-ups applied in `918171d` (timestamptz columns, conditional markCancelled, explicit DLQ retry options). Full suite re-verified 714/714.
Residual risk noted in PR body: complete-build intentionally unguarded (spec); tiny race window before step-2 cancel.

Next phase (fresh session): address PR review comments on #278, then PR 5 (web badges/polling/retry).
Resume prompt: "PR 4 is open as #278 in /home/gomaa/Github/marsa-workspace/marsa — read progress.md; address its review comments, or start PR 5 (web) from docs/superpowers/specs/2026-11-01-domain-events-job-queue-design.md Web section."

## Open issues

- AppImagesDeletedDomainEvent lives in app-management/events/ (Task 4 decision; Task 5 imports cross-feature).
- pg-boss dead-letter sourceName/sourceOutput handling pinned in Task 4 handler + test.

Resume prompt for a fresh session:
"Resume PR 4 in /home/gomaa/Github/marsa-workspace/marsa — Tasks 1–7 are done (branch feat/245-async-delete-app); run the whole-branch review then open the PR to main (references #245, closes #267)."
