# Git-based build & deploy + in-cluster registry — design (v0.2 Phase C)

Status: approved in conversation 2026-09-23. Covers #78, #60, #61, #21, #116 plus one new ticket
carved out of #21. Stacked PRs, one per ticket, in the order below. The Phase B agent works on
`main` in parallel; see [Coordination with Phase B](#coordination-with-phase-b).

## Goal

A push to a connected GitHub branch builds the repo **in the cluster**, stores the image **in the
cluster**, and deploys it with no manual step. That is v0.2 Goals 2 and 3.

```text
git push ─► GitHub webhook ─► Marsa api (HMAC verify, match apps by repo+branch)
         ─► build row (running) + BuildKit Job in marsa-builds
         ─► Job pushes <app-slug>:<sha> to Zot via the in-cluster Service
         ─► BuildSweeper (every 5s) sees the Job finished
         ─► CompleteBuild: app.image = imageRef, new Release, AppRuntime.deploy
         ─► kubelet pulls registry.<base>/… with the read-only marsa-pull credential
```

## Out of scope

- **Build in the cluster, store outside it.** Removed on purpose.
- **Redeploying on push of an image built elsewhere** (GH Actions → Docker Hub). Its own later
  ticket.
- **Buildpacks / Railpack.** Dockerfile-first only; a repo with no Dockerfile fails with a clear
  reason. Buildpacks are a follow-up that nothing here blocks.
- **Build caching** beyond what BuildKit does inside one Job.
- **Preview / multi-branch environments.**
- **A watch-based completion trigger.** The sweep is enough (see D6); a watch can later be added as
  a second trigger of the same use-case.
- **Reconciling deploy status in the sweeper (#198).** Possible later, not here.
- **"Add a database" in the create menu.** It depends on Phase B's #206.
- **Registry UI, per-tenant registry isolation, log retention/search.**

## Decisions

| #   | Decision                    | Choice                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Where built images live     | An in-cluster registry, from the first build. External registries are not supported for built images                                                                                                                                                                                                                                                                                                               |
| D2  | How images move             | **Pull** via `registry.<MARSA_BASE_DOMAIN>` behind Traefik with the chart's Let's Encrypt resolver; containerd trusts LE by default, so real installs need no node config. **Push** from pods to the in-cluster Service `marsa-registry.<ns>.svc.cluster.local:5000` over plain HTTP. Same Zot repo and tag under both names. Only `--no-tls` installs and k3d get a `registries.yaml` that skips TLS verification |
| D3  | Registry software           | **Zot**, run minimally: the `zot-minimal` image, or full `zot` with every extension disabled. Memory limit ~256Mi with `GOMEMLIMIT`                                                                                                                                                                                                                                                                                |
| D4  | Build engine / strategy     | **Rootless BuildKit** (Kaniko was archived 2025-06-03), `buildctl-daemonless.sh` in a one-shot Job. Dockerfile-first                                                                                                                                                                                                                                                                                               |
| D5  | Source fetch                | BuildKit's git context `https://github.com/<repo>.git#<sha>:<rootDir>` with the installation token as a BuildKit secret. Marsa never clones                                                                                                                                                                                                                                                                        |
| D6  | Completion detection        | A sweep: `@nestjs/schedule` `@Cron('*/5 * * * * *', { waitForCompletion: true })`, row-claimed with `FOR UPDATE SKIP LOCKED`                                                                                                                                                                                                                                                                                       |
| D7  | App ↔ repo link             | Nullable `app.source` jsonb; `app.image` becomes nullable and means "the image the next release uses"                                                                                                                                                                                                                                                                                                              |
| D8  | Push during a running build | The new build replaces the old one: the old build is `cancelled` and its Job deleted                                                                                                                                                                                                                                                                                                                               |
| D9  | Retention                   | Zot keeps the 10 most recently pushed tags per app repo (chart value). Deleting an app deletes its registry repo. Rolling back past the kept images fails at pull time via the existing `readDeployFailure`                                                                                                                                                                                                        |
| D10 | Build namespace             | `marsa-builds`, never an environment namespace. Rootless BuildKit needs `Unconfined` seccomp/AppArmor, which must not leak into env namespaces (#219)                                                                                                                                                                                                                                                              |
| D11 | Registry auth               | Zot htpasswd with two users: `marsa-push` (write; held by build Jobs and by the api for repo deletion) and `marsa-pull` (read-only, copied into env namespaces as the image-pull Secret)                                                                                                                                                                                                                           |
| D12 | UI                          | Minimal: "Deploy from GitHub" is the main create path, "Deploy an image" moves to advanced; app detail gets a builds list, rebuild and a log view                                                                                                                                                                                                                                                                  |

### Why these, briefly

- **D2 over `registries.yaml` on every node.** The api runs in a pod and can't edit node files. The
  same limit forced Epinio to pull its built-in registry over plain HTTP. Push webhooks already
  require public DNS + TLS (AgDR-0005), so D2 adds no new requirement.
- **D2's push/pull split.** A pod resolving `registry.<base>` goes through public DNS: in e2e that
  is `127.0.0.1` (the pod's own loopback), and on clouds that NAT the public IP it depends on
  hairpin support. Pushing to the in-cluster Service avoids both. A registry stores `repo:tag`, not
  the hostname a client used, so the image pushed under one name is pulled under the other.
- **D3.** Distribution (`registry:2/3`) has no retention policies and needs the registry read-only
  to reclaim space. Its htpasswd auth has no permission levels, so D11 would need a separate token
  server. Harbor needs 2–4 GB and its own Postgres/Redis. Measured idle RAM: Distribution 10 MiB,
  zot-minimal 23 MiB, full zot 51 MiB with ~13% of a core constantly busy on extensions.
- **D6 over a Kubernetes watch.** A watch still needs a sweep for Jobs deleted before the api saw
  them finish. Builds take minutes, so 5 s of delay is invisible. `@Interval` is plain
  `setInterval` and can overlap runs; `@Cron` with `waitForCompletion` cannot.
- **D7 over a separate table or an image-or-repo `source` column.** It matches how `domain` and
  `nodePin` are stored. Keeping `app.image` as "next image" leaves `snapshotOf`, `update-app` and
  rollback untouched.

## Tickets and PR order

| Order | Ticket                                     | Repo(s)                                   | Closes              |
| ----- | ------------------------------------------ | ----------------------------------------- | ------------------- |
| 1     | #78 Self-hosted registry                   | marsa-charts, marsa (e2e scripts, config) | #78                 |
| 2     | _new_ In-cluster build (carved out of #21) | marsa, marsa-charts (namespace + RBAC)    | new ticket, **#60** |
| 3     | #61 Push webhook receiver                  | marsa                                     | #61                 |
| 4     | #21 Repo-first create flow (the remainder) | marsa (api + web)                         | #21                 |
| 5     | #116 Build logs                            | marsa (api + web)                         | #116                |

The new ticket is created with `/task` before PR 2 starts. #60's acceptance criteria are all met by
PR 2 (token mint → BuildKit secret; private repos; clear auth failures), so it closes there.

AgDRs, numbered when each PR opens:

- Registry: Zot, Traefik exposure, retention, two users (PR 1).
- Build strategy and engine: Dockerfile-first, rootless BuildKit, git context (PR 2).
- Build completion by sweep via `@nestjs/schedule` (PR 2, new dependency).
- Migration AgDR for PR 2's schema change, via `/migration`.

---

## 1 — Registry (#78)

### Chart (marsa-charts)

- A Zot StatefulSet (1 replica) + PVC (`local-path`), a ClusterIP Service, and an IngressRoute for
  `registry.<baseDomain>` using the chart's existing `certResolver: le`.
- Config (`config.json` in a ConfigMap):
  - `storage.gc: true`
  - `storage.retention.policies: [{ repositories: ["**"], deleteUntagged: true, keepTags: [{ mostRecentlyPushedCount: <values.registry.keepImages, default 10> }] }]`
  - `http.auth.htpasswd` plus `accessControl`: `marsa-push` can read/create/update/delete on `**`,
    `marsa-pull` can only read `**`.
- One generated Secret, `marsa-registry-secrets` in the release namespace, generate-once like
  `marsa-api-secrets`: `PUSH_PASSWORD`, `PULL_PASSWORD` and a bcrypt `htpasswd` file for Zot. The
  api reads both passwords as env. PR 2 adds the push dockerconfigjson that build Jobs mount in
  `marsa-builds`.
- Resources: requests 50m / 64Mi, limit 256Mi, `GOMEMLIMIT` ~200MiB.
- **First implementation step:** check on k3d that `mostRecentlyPushedCount` retention works in the
  minimal setup (zot-minimal, or full zot with extensions off). If it needs the metadata DB and
  minimal lacks it, use full zot with extensions disabled. If neither works, stop and revisit D3.
  The fallback is Distribution plus a Marsa-side cleanup, which changes D9 and D11.

### Api (marsa)

- Config, validated by the global Joi schema and required only when `MARSA_RUNTIME=kubernetes`:
  `MARSA_REGISTRY_HOST` (public pull host), `MARSA_REGISTRY_URL` (in-cluster `http://…:5000`),
  `MARSA_REGISTRY_PUSH_PASSWORD`, `MARSA_REGISTRY_PULL_PASSWORD`. Usernames are fixed constants
  (`marsa-push`, `marsa-pull`).
- A new port `ImageRegistry` (`src/modules/runtime/image-registry.ts`):
  - `pullCredentialsFor(imageRef): RegistryCredentials | undefined`. Returns the `marsa-pull`
    credentials when the image's host is `MARSA_REGISTRY_HOST`, otherwise `undefined`.
    `deploy-release` and `update-app` use it before falling back to the app's decrypted
    `imagePullCredentialsEnc`, so nothing registry-related is stored in Postgres.
  - `deleteRepository(appSlug)`. The Zot adapter deletes every tag through the OCI distribution API
    at `MARSA_REGISTRY_URL` as `marsa-push`; Zot GC then reclaims blobs and drops the empty repo.
    Idempotent: a missing repo counts as success.
  - Mock adapter for tests. `delete-app` calls `deleteRepository` last, after `AppRuntime.destroy`.

### Installer / k3d / e2e (marsa)

- `install.sh --no-tls` writes `/etc/rancher/k3s/registries.yaml` with `insecure_skip_verify` for
  `registry.<domain>` before installing K3s. A `--no-tls` install serves Traefik's self-signed
  default certificate, so its nodes could not pull built images otherwise. CI's real-K3s e2e uses
  this path.
- `scripts/e2e-up.sh` passes the same file to k3d via `--registry-config`.
- `pnpm e2e:test` gains a registry stage, pushing from an in-cluster Job (as builds will):
  - push as `marsa-push` to the in-cluster Service, then a pod pulls it via `registry.<domain>`
  - a push as `marsa-pull` is rejected

---

## 2 — In-cluster build (new ticket, closes #60)

### Schema (one migration, `/migration` + AgDR)

```text
app.source          jsonb NULL   { type: 'github', installationUuid, repo: 'owner/name',
                                   branch, rootDir: '.', dockerfilePath: 'Dockerfile' }
app.image           varchar NULL (was NOT NULL)
CHECK (image IS NOT NULL OR source IS NOT NULL)
INDEX app_source_repo_branch ON app ((source->>'repo'), (source->>'branch'))

build
  uuid            uuid PK default uuidv7()
  app_uuid        uuid NOT NULL → app.uuid (onUpdate cascade; removed with the app like releases)
  commit_sha      varchar(40) NOT NULL
  branch          varchar(255) NOT NULL
  status          build_status_enum  running | succeeded | failed | cancelled
  trigger         build_trigger_enum push | create | manual
  image_ref       varchar(255) NULL  (set on success)
  failure_reason  text NULL
  created_at / updated_at
  INDEX (app_uuid, created_at DESC)
  PARTIAL INDEX (created_at) WHERE status = 'running'

release.build_uuid  uuid NULL → build.uuid
```

`build` lives in a new `build` feature (`src/app/build/`) that owns the table, enums, use-cases and
the sweeper. `ReleaseTrigger.Webhook` is used for push-triggered releases; builds triggered by
create or manual rebuild produce `ReleaseTrigger.Manual` releases.

### Port

```ts
// src/modules/runtime/build-runtime.ts
export abstract class BuildRuntime {
  abstract start(build: BuildRef, spec: BuildSpec): Promise<void> // idempotent per build uuid
  abstract cancel(build: BuildRef): Promise<void> // idempotent; a missing Job is fine
  abstract readStatus(build: BuildRef): Promise<BuildObservation>
  abstract readLogs(build: BuildRef): Promise<string | null> // PR 5
}

interface BuildRef {
  build: { uuid: Uuid<'Build'> }
  app: { slug: string }
}
interface BuildSpec {
  repoUrl: string // https://github.com/owner/name.git
  commitSha: string
  rootDir: string
  dockerfilePath: string
  gitToken: string
  pushRef: string // marsa-registry.<ns>.svc.cluster.local:5000/<app-slug>:<commitSha>
  imageRef: string // registry.<base>/<app-slug>:<commitSha>, recorded on the build and release
}
type BuildObservation =
  | { state: 'running' }
  | { state: 'succeeded' }
  | { state: 'failed'; reason: string }
  | { state: 'not_found' }
```

`RuntimeModule` loads the Kubernetes or mock `BuildRuntime` alongside the other ports, on the same
`MARSA_RUNTIME` switch.

### Kubernetes adapter

One `batch/v1` Job per build in `marsa-builds`, named `build-<uuid>`, labelled
`marsa.cloud/build-uuid` and `marsa.cloud/app`:

- **Image:** `moby/buildkit:<pinned>-rootless` running `buildctl-daemonless.sh build`:
  - `--frontend dockerfile.v0`
  - `--opt context=<repoUrl>#<commitSha>:<rootDir>`
  - `--opt filename=<dockerfilePath>`
  - the git token as BuildKit's git-auth secret
  - `--output type=image,name=<pushRef>,push=true,registry.insecure=true` (plain HTTP to the
    in-cluster Service; see D2)

  Pin the exact flags and secret id during implementation, against the pinned BuildKit version.

- **Security context:** `runAsUser/runAsGroup: 1000`, seccomp + AppArmor `Unconfined`,
  `BUILDKITD_FLAGS=--oci-worker-no-process-sandbox`.
- **Push credentials:** `DOCKER_CONFIG` mounted from a `marsa-registry-push` dockerconfigjson
  Secret in `marsa-builds`, generated by the chart in this PR from `marsa-registry-secrets`.
  `ImageRegistry` gains `imageRefFor(appSlug, tag)` and `pushRefFor(appSlug, tag)` here.
- **Git token:** a per-build Secret `build-<uuid>-git` with an `ownerReference` to the Job, created
  right after the Job so Kubernetes garbage-collects it with the Job.
- **Job settings:**
  - `backoffLimit: 0`
  - `activeDeadlineSeconds: 1800`
  - `ttlSecondsAfterFinished: 3600`
  - `terminationMessagePolicy: FallbackToLogsOnError`
  - resources from chart values
- **`readStatus`:**
  - Job `Complete` → `succeeded`.
  - `Failed` with reason `DeadlineExceeded` → `failed: "timed out after 30m"`.
  - Any other `Failed` → `failed:` the pod's terminated message (the last ~2 KB of BuildKit output),
    falling back to the condition message.
  - Missing → `not_found`.
- **`cancel`:** delete the Job with `propagationPolicy: Background`; a 404 is success.

The mock adapter records calls, reports `succeeded` by default, and has a test hook to queue a
failure or `not_found`.

Chart (marsa-charts): the `marsa-builds` namespace, plus a Role/RoleBinding for the api
ServiceAccount there: `jobs` (create, get, list, delete), `secrets` (create, delete), `pods` (get,
list), `pods/log` (get). Build resource values go under `values.build.*`.

### Feature boundary

The api allows cross-feature imports only of `entities/`, `queries/`, `enums/`, `errors/` and
`events/`, never another feature's services or use-cases (AgDR-0040, AgDR-0046). So starting a build
is **not** a shared use-case:

- Pure pieces live in `build/entities/`: `imageRefOf(registryHost, appSlug, commitSha)`,
  `buildSpecOf(app, build, gitToken, registryHost)`, and `readableGitHubError(error)`.
- Every use-case that starts a build does its own writes in its own transaction and calls the
  ports (`GithubClient`, `BuildRuntime`) itself. These are rebuild and receive-push (in `build/`) and
  create-app (in `app-management/`, which may import `build`'s table and entities).
- Inside `build/`, rebuild and receive-push share a `build/services/build-starter.service.ts`.

### Starting a build (the shared sequence)

1. `tx`: lock the app (`FOR UPDATE`). Set its `running` builds to `cancelled`. Insert the new build
   as `running`.
2. Mint the installation token (`GithubClient.getInstallationToken`) for `source.installationUuid`.
3. Runtime last: `BuildRuntime.cancel` for each cancelled build, then
   `BuildRuntime.start(buildSpecOf(…))`.
4. If step 2 or 3 throws, still inside the outer transaction, set the new build to `failed` with
   `readableGitHubError(error)` ("installation cannot access owner/name", "token mint failed: …") or
   the runtime error. Steps 2–3 write nothing to the DB, so no savepoint is needed; the
   cancellations stay committed.

**`CompleteBuildUseCase.execute(buildUuid, observation)`**

1. `tx`: claim `SELECT … FROM build WHERE uuid = $1 AND status = 'running' FOR UPDATE SKIP LOCKED`.
   No row means return (another replica has it, or it has already finished).
2. `failed` / `not_found`: set `failed` with the reason (`not_found` → "build job disappeared").
   Return; no release is created and `app.image` is untouched.
3. `succeeded`: set the build `succeeded` with `image_ref`. Lock the app and set
   `app.image = image_ref`. Insert a release from `snapshotOf(app)` with `buildUuid` and the trigger
   mapping above.
4. Deploy that release the way `update-app` already does: its own repository writes the release row,
   and it calls `deploySpecOf` (from `release/entities/`) and `AppRuntime.deploy` directly. The
   deploy runs inside a savepoint, like `DeployReleaseUseCase`. A failed deploy rolls back the
   savepoint and marks the **release** `failed`; the build stays `succeeded` and `app.image` stays
   updated.

**`BuildSweeper`**: `@Cron('*/5 * * * * *', { name: 'build-sweep', waitForCompletion: true })`.

1. List `running` builds (via the partial index).
2. For each, call `BuildRuntime.readStatus` and, if it isn't `running`, call `CompleteBuildUseCase`.
3. A build still `running` more than `activeDeadlineSeconds + 5m` after `created_at` is completed as
   `failed: "build exceeded its deadline"` regardless of the observation.
4. Errors are logged per build and never stop the sweep.

`ScheduleModule.forRoot()` is loaded through `ConditionalModule.registerWhen` only when
`MARSA_RUNTIME !== 'mock'`, so tests and `pnpm dev:api` never run the timer. Tests call `sweep()`
directly.

### Endpoints

| Endpoint                     | Roles            | Behaviour                                                                                                        |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /v1/apps/:slug/builds`  | Operator, Member | Paginated per the existing pagination contract, newest first                                                     |
| `POST /v1/apps/:slug/builds` | Operator, Member | Rebuild: `getBranchHead(source.repo, source.branch)`, then start a build (`trigger: manual`). 409 for image apps |

`create-release` on an app with `image = null` returns **409 "App '<slug>' has no image yet; wait
for its first build."**

`GithubClient` gains `getBranchHead(installationId, repo, branch): Promise<string>`, with its mock.

---

## 3 — Push webhook (#61)

`POST /v1/github/webhooks`, marked `@Public()`, as the `receive-push` use-case in the **`build`**
feature. A push's effect is starting builds, so it lives with the aggregate it writes, not with the
route noun. It reads `github_app` / `github_installation` through those features' entities.

1. Verify `X-Hub-Signature-256` with `@octokit/webhooks`' `verify` against the decrypted
   `github_app.webhookSecretEnc`. This needs the raw body: register a raw-body content parser for
   this route only (Fastify), leaving global JSON parsing alone. Missing or invalid signature → 401.
2. Handle only `X-GitHub-Event: push`. Everything else (including `ping`) → 202, no effect.
3. Ignore `refs/tags/*` and `deleted: true` → 202.
4. Find apps where `source->>'repo' = repository.full_name` and `source->>'branch' = <branch from
ref>`, **and** whose `source.installationUuid` maps to `installation.id` in the payload. Start a
   build (`trigger: push`, `commitSha: after`) for each, one transaction per app, so one failing
   app doesn't stop the others.
5. Return 202 with `{ builds: [{ appSlug, buildUuid }] }` (an empty list is fine).

GitHub delivery retries: a redelivered push for a commit whose build already exists or has
finished must not start a second build. Receive-push skips an app whose newest build has the same
`commit_sha` and is `running` or `succeeded`. The manual rebuild does not skip; rebuilding the same
commit is its point.

---

## 4 — Repo-first create flow (#21, remainder)

### Api

- `POST /v1/apps` accepts exactly one of `image` or `source` (a class-validator rule; both or
  neither → 400). With `source`:
  1. Resolve the installation and call `getBranchHead` **before** any insert. On failure → **422**
     with GitHub's reason ("repository not accessible to the installation", "branch not found").
     No app is created.
  2. Insert the app with `image = null`.
  3. Run the build-start sequence (`trigger: create`) in the same transaction, runtime last, using
     `build`'s table and entities (see [Feature boundary](#feature-boundary)).
- **The `$PORT` convention:** for `source` apps `containerPort` is optional and defaults to 8080.
  The deploy spec always injects `PORT=<containerPort>` into env unless the user set `PORT`. For
  image apps the field stays required and nothing is injected, as today.
- `GET /v1/github/installations/:uuid/repos` → `{ fullName, defaultBranch, private }[]`, from a new
  `GithubClient.listInstallationRepos(installationId)`, with its mock.
- The app detail response gains `source` and `latestBuild` (status, commitSha, failureReason,
  createdAt).
- OpenAPI regenerated and committed; web `app/api/*` regenerated.

### Web

- `/apps/new`: **Deploy from GitHub** by default. Installation → repo (searchable select) → branch
  (defaults to the repo's default branch) → root directory (default `.`) → Dockerfile path (default
  `Dockerfile`) → env vars, plus the existing project/environment selects. **Deploy an image** sits
  behind an "Advanced" toggle, with the current form unchanged.
- App detail: a **Builds** card listing status badge, short SHA, trigger, age, and failure reason on
  failed builds, with infinite scroll on the existing pagination composable. A **Rebuild** button
  for source apps.

---

## 5 — Build logs (#116)

- `BuildRuntime.readLogs`. Kubernetes: read the Job's pod log (`pods/log`, whole log, no follow).
  `null` if the Job or pod is gone.
- `GET /v1/apps/:slug/builds/:buildUuid/logs` → `{ logs }`, or **404** once the Job has been cleaned
  up ("build logs are kept for 1 hour").
- Web: a log view (monospace, scrollable) opened from a build row, with a 404 empty state.

---

## Testing

- **Unit (`*.spec.ts`):**
  - Job rendering: args, security context, Secret ownership, labels.
  - Job/pod → `BuildObservation` mapping, including `DeadlineExceeded` and the termination message.
  - Webhook signature verification and payload filtering.
  - The `image`-xor-`source` validator.
  - `ImageRegistry.pullCredentialsFor` host matching and the Zot adapter's repo deletion.
  - `PORT` injection.
- **Api e2e (least-mocks harness, real Postgres, mock runtime + mock GitHub):**
  - push → running build → `sweep()` → release deployed, checked via `GET builds` / `GET releases`
  - a second push cancels the first
  - a failed build creates no release and leaves `app.image` unchanged
  - a successful build with a failed deploy: build `succeeded`, release `failed`
  - a redelivered webhook doesn't double-build
  - 422 on create with an inaccessible repo
  - 409 from `create-release` with no image
  - two concurrent `CompleteBuild` calls on one build complete it exactly once
  - the scheduler is absent under `MARSA_RUNTIME=mock`
- **Web:** Vitest component tests for the create form (both modes), builds list states, rebuild and
  the log view; the existing Playwright e2e covers creating from GitHub against the mock api.
- **k3d e2e:**
  - PR 1's registry checks
  - PR 2: a real BuildKit Job builds a **public** fixture repo (no token), pushes it to Zot, and the
    app serves traffic
- **Manual QA:** the private-repo criterion (#21, #60) needs a real GitHub App, so it's verified by
  hand on a real install. #228 applies to these PRs.
- Coverage floors unchanged (web 88/85/60, api 80/75/75); never lowered.

## Coordination with Phase B

- **Migrations.** Phase B (#205–#207) adds migrations on `main` in parallel. Whichever phase merges
  second rebases and regenerates its Drizzle migration rather than hand-merging the snapshot/journal.
- **AgDR numbers.** Numbers are assigned when a PR opens, not in this spec, to avoid collisions.
- **`AppDeploySpec` / `deploySpecOf`.** Phase B's #205 also extends these (volumes). Keep this
  phase's change to that file to the credential selection and `PORT` injection, and rebase on #205
  if it lands first.
