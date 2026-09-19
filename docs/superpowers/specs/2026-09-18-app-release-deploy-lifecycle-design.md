# App / Release / Deploy lifecycle — design (#179)

Status: approved in conversation 2026-09-18. Single PR, plain Drizzle migration, no `/migration`
ticket or AgDRs.

## Problem

`POST /v1/deploy` fuses three writes: upsert `App`, insert `Release`, apply manifests. A `Release`
stores only `imageRef`, so it can't be rendered again faithfully. That rules out rollback, and
"deploy the config I just edited" has no clean home. V0.1 already shipped the release-uuid
pod-template annotation and the shared `ApplyReleaseService`. KEDA owns scaling (AgDR-0043), so a
snapshot carries a replica _range_.

## Decisions

| Decision           | Choice                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle          | Three independent use-cases, sequenced by the caller: `create-app`, `create-release`, `deploy-release`, plus `update-app` for config edits                                                                                                                             |
| Snapshot           | `Release` freezes workload config: `imageRef`, `env`, `containerPort`, `minReplicas`, `maxReplicas`, `imagePullCredentialsEnc`. `slug` and `domain` stay on `App`, because a rollback must never resurrect an old hostname                                             |
| Backfill           | Existing releases copy their app's current row. They were rendered from that row, so nothing changes for them                                                                                                                                                          |
| Config edits       | Staged. `update-app` writes `App` only; a Release is minted when the operator deploys                                                                                                                                                                                  |
| `update-app`       | `PATCH /v1/apps/:slug` replaces `PUT /v1/apps/:slug/env`. Every field is optional. `imagePullCredentials`: omitted = keep, `null` = clear, object = replace                                                                                                            |
| Rollback           | `create-release` with `fromReleaseUuid` copies that release's snapshot into a new release (`triggeredBy: rollback`, `sourceReleaseUuid` set) **and writes the snapshot back to `App` in the same transaction**. History stays append-only, and "newest = live" holds   |
| `deploy-release`   | Takes a release uuid. **409 unless it is the app's newest release.** The uuid doubles as a concurrency guard. Idempotent: it resets status to `pending`, applies, and marks `failed` on error                                                                          |
| Reconcile guard    | `DeployBackend.readLiveReleaseUuid` reads the Deployment's pod-template annotation. The release list skips reconciling the newest release when a _different_ release is live (non-null mismatch), so an undeployed release can't inherit the previous rollout's status |
| Undeployed changes | `GET /v1/apps/:slug` gains `hasUndeployedChanges`: true when the app has no release or its config differs from the newest release's snapshot. It replaces the web's in-memory `envRedeployPending`                                                                     |
| Removed            | `POST /v1/deploy`, `POST /v1/apps/:slug/redeploy`, `PUT /v1/apps/:slug/env`                                                                                                                                                                                            |

## API

| Use-case         | Module           | Route                                                      | Success                                                             | Errors                                                                    |
| ---------------- | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `create-app`     | `app-management` | `POST /v1/apps`                                            | 201 `{ slug, url }`                                                 | 400 validation, 409 slug taken                                            |
| `update-app`     | `app-management` | `PATCH /v1/apps/:slug`                                     | 200 `{ slug, image, containerPort, minReplicas, maxReplicas, env }` | 400, 404                                                                  |
| `create-release` | `release`        | `POST /v1/apps/:slug/releases` body `{ fromReleaseUuid? }` | 201 `{ releaseUuid, appSlug, triggeredBy, sourceReleaseUuid }`      | 404 app, 404 source not found or owned by another app                     |
| `deploy-release` | `release`        | `POST /v1/releases/:uuid/deploy`                           | 200 `{ releaseUuid, appSlug, url, deployStatus }`                   | 404, 409 not newest, 500 credentials undecryptable, apply errors as today |

Module boundaries: `release/` → `app-management/entities` stays the main direction. `app-management`
already imports `release/entities` (`delete-app`), and `view-app-detail` reuses that sanctioned seam
to read the newest release. The App-config validators (`SLUG_PATTERN`, port/replica bounds,
`ImagePullCredentials`, `IsGteField`) move from `release/use-cases/deploy-app/` to
`app-management/entities/`.

## Web

- `useShipRelease().ship(slug, { fromReleaseUuid? })` is the single place that sequences
  `create-release` → `deploy-release`. Deploy, Redeploy, Rollback, and `/apps/new` all use it.
- `/apps/new`: `create-app`, then `ship`. A create failure keeps the form open with the error. A ship
  failure still navigates to the app page, with a warning toast: "App created, but the deploy failed".
- App page:
  - an "Undeployed changes" banner driven by `hasUndeployedChanges`, with a Deploy button
  - `AppConfigForm` (image, port, replica range, env rows) saving through `update-app`
  - `AppReleaseList` with "Roll back" on older releases behind a confirm, and a "Rollback of …" label
  - Redeploy ships the current config
  - every ship refreshes releases, health, and config, including on failure (a 409 or failed
    release then shows)
- Pull credentials stay API-only. The web never had a credentials field, so this isn't a regression.

## Testing

- API: unit + e2e per new use-case, the render test reading from the release only, reconcile-guard
  unit tests, a backend `readLiveReleaseUuid` unit test, and snapshot-helper unit tests.
- Web: specs for the new composables, `AppConfigForm`, `AppReleaseList`, `/apps/new`, and the app page.
- Contract regenerated and drift-clean. `scripts/e2e-test.sh` moves to the three calls.
- Coverage floors unchanged.
