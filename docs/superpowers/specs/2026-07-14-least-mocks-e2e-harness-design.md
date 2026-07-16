# Least-Mocks E2E Harness + Installer Verification — Design

> In the context of Marsa's testing gap (the real deploy path is never exercised end-to-end), facing three overlapping tickets (#55 installer CI, #122 k3d E2E, #134 fast local stack), we decided to build **one shared spine** — `install.sh` + `seed-dev` + a `make e2e` wrapper — with three thin consumers, to get least-mocks E2E coverage **and** a real local dev environment **and** installer verification without three drifting harnesses.

**Tickets:** collapses **#55** into **#122**; closes **#134** (folding its doc/script tail here). **Marsa-only — no chart change** (see § TLS).

**Status:** design approved (brainstorm); revised after verifying chart + workflows. Pending spec review → implementation plan.

---

## Problem

Nothing exercises Marsa's real deploy path end-to-end:

- The api's e2e tests wire `MockDeployBackend` (via `NODE_ENV=test`) — no cluster, nothing applied.
- `install.sh` (the production VPS installer) has **no automated test** — a regression in its K3s bootstrap or chart install ships silently.
- The fast local stack (#134) deliberately skips Kubernetes for inner-loop speed.

**Goal: E2E-test Marsa with the least amount of mocks** — and, because a least-mocks test environment *is* a real dev environment, have that same artifact double as the on-demand "test a deploy + dummy domain locally" workflow.

## Key insight

The **least-mocks E2E environment** and the **real local dev environment** are the same artifact. Both need: a real cluster, a real Marsa install, real deploys through the API, and real (dummy) domains over HTTPS. Build it once; CI and a developer at a laptop are two callers of the same spine.

The three tickets don't need three harnesses — they need **one spine with three consumers** that differ only in *which cluster substrate* they use and *how many assertions* run after bring-up.

---

## The spine and its three consumers

**Spine (build once):**

1. **`install.sh`** — cluster (optional) + Helm + `helm upgrade --install` of the Marsa chart. The single chart-install path; never duplicated.
2. **`seed-dev.ts`** — seed a dev operator + mint a valid `@fastify/secure-session` cookie (the auth bypass), reused across consumers.
3. **`scripts/e2e-up.sh` / `make e2e`** — thin wrapper holding all test-*only* concerns (k3d creation + port map, nip.io domain, PR image tag, `curl -k` assertions, teardown).

**Consumers:**

| Consumer | Cluster | `install.sh` path | Seeder | Proves |
|---|---|---|---|---|
| **CI E2E** (collapsed #55 + #122) | real K3s | **full** (`curl\|sh` K3s bootstrap + helm) | user-only | installer works end-to-end **+** least-mocks deploy + HTTPS |
| **Local dev / on-demand E2E** | k3d (disposable) | `--skip-k3s` (into existing k3d) | user-only | fast disposable deploy/domain testing; poke-around |
| **#134 no-cluster inner loop** | none | — | full (user + sample apps) | FE inner loop against mock backends |

The load-bearing move: **CI runs the *full* `install.sh` on real K3s** so a single job transitively proves *both* "the installer works" (#55's re-scoped purpose) **and** "least-mocks deploy + HTTPS" (#122). If CI instead used `--skip-k3s`+k3d, it would never execute the installer's own K3s bootstrap — silently dropping #55's whole point. `--skip-k3s` therefore exists for **local disposability + a real user feature** (install onto an existing cluster), *not* as the CI path.

---

## Decisions

### D1 — Collapse #55 into #122; close #134

One ticket, one workflow, one spine. #55's "installer works" is a checkpoint inside the CI E2E's full-install path, not a separate harness. #134's core (`seed-dev.ts`) is already shipped; its residual ACs (`docs/local-dev.md`, a `pnpm seed` alias, a combined `pnpm dev`) are folded into this work and #134 is closed referencing it.

### D2 — Cluster substrate split by caller

CI = full real K3s (via `install.sh`); local dev = k3d + `install.sh --skip-k3s`. Both substrates are K3s, so chart behaviour is near-identical; only the bootstrap differs (exercised only in CI, which is where it matters).

### D3 — `install.sh` gains exactly one flag: `--skip-k3s`

Guardrail: **only add installer flags that serve a real user, never test-only ones.**

- **`--skip-k3s`** (a.k.a. `--use-existing-cluster`): skip the `curl|sh` K3s bootstrap, honor `$KUBECONFIG`, run only install-Helm + `deploy_marsa`. Real-user value: "deploy Marsa onto a cluster I already run." Lets local dev reuse the *exact* helm path against k3d.

No TLS flag is needed — see § TLS. Test-only concerns stay in the wrapper. `--skip-k3s` is AgDR-worthy (see § Governance).

### D4 — Decouple deploy-backend selection from `NODE_ENV`

`kubernetes.module.ts` currently welds `MockDeployBackend` to `NODE_ENV==='test'`. The E2E needs `NODE_ENV=test` conveniences *with* `DirectApplyDeployBackend`. Introduce an explicit selector (`DEPLOY_BACKEND=direct|mock`) that defaults to the current behaviour when unset (mock under test, direct otherwise) so nothing regresses.

### D5 — `seed-dev --user-only`

`seed-dev.ts` seeds a user + cookie **and** inserts sample `App`/`Release` rows with a *faked* `DeployStatus.Succeeded`. That fake is correct for #134 (no cluster) but is the opposite of "least mocks" for the E2E. Add `--user-only` so the E2E reuses the auth bypass, then deploys apps *for real* through the API.

### D6 — CI trigger: after-build + manual only

The E2E must run **after** the images it tests exist:

- **`workflow_run` on CD completion** (mirrors `deploy.yml`) — on `main`, after `cd.yml` builds+pushes the commit's `…:<sha>` images, the E2E installs that sha.
- **`workflow_dispatch`** — opt-in pre-flight; for a PR, label it **`preview`** so `cd.yml` publishes `…:<sha>`, then dispatch the E2E with that tag.

**No raw per-PR `push` trigger** — the full real-K3s E2E is heavy and the image wouldn't exist yet. The E2E **never builds images itself**; it consumes the `preview`/CD-built sha via `helm --set image.tag=<sha>`.

---

## TLS — no chart change, no mkcert

The chart already gives the E2E real HTTPS:

- `ingress-route.yml` always listens on `websecure` (443). With `tls.enabled: false` it emits **no `certResolver`** → **Traefik serves its default self-signed cert** (per the template's own comment). With `tls.enabled: true` it sets `certResolver: le` (ACME tlsChallenge), which **fails on `*.nip.io`** (not publicly reachable) and **falls back to the same self-signed cert**.

So the E2E installs with **`--no-tls`** (existing flag → `tls.enabled=false`, deterministic self-signed) and asserts with **`curl -k https://…`**. Testing real Let's Encrypt *issuance* is impossible in CI (needs public DNS) and is explicitly out of scope. **No `--tls` flag, no mkcert, no marsa-charts ticket.**

---

## Mock boundary ("least mocks")

| Concern | E2E | Note |
|---|---|---|
| Deploy backend | **REAL** (`DirectApplyDeployBackend` → cluster) | the whole point (D4) |
| DB / Redis / secret cipher | **REAL** | already real in e2e |
| Ingress / TLS / domain | **REAL** ingress on 443, **self-signed** (`curl -k`) | LE issuance itself un-testable in CI, accepted (§ TLS) |
| App-under-test image | **PR/CD-built `…:<sha>`** (deploy target = trivial public image, e.g. `nginx`) | build-from-source out of scope until #31 |
| GitHub OAuth login | **Seeded** (`seed-dev --user-only`) | interactive OAuth can't run in CI (D5) |

---

## Assertions

**CI E2E (one job, positive assertions):**

1. `install.sh` (full) completes → Marsa release **Ready** + API `/health` responds. *(← #55's assertion.)*
2. Deploy a sample app through Marsa's API → its Deployment + ClusterIP Service + Traefik IngressRoute are applied to the cluster.
3. The deployed app is **reachable over its domain via HTTPS** (`curl -k https://<slug>.127.0.0.1.nip.io`). *(← #122's assertion.)*

**Negative probe (one-time, dev-time — not a standing job):** during implementation, deliberately break a template/validation, run `make e2e`, confirm it goes **red**, revert. Proves the assertions actually assert (TDD: see it fail before trusting green). Satisfies #122's "red on a broken probe" AC without a recurring CI matrix.

**Local:** same wrapper, k3d substrate, leaves the cluster up for manual poking; explicit `make e2e-down` teardown.

---

## Components / artifacts

| Artifact | Change |
|---|---|
| `scripts/install.sh` | `--skip-k3s` (D3) |
| `apps/api/src/modules/kubernetes/kubernetes.module.ts` | `DEPLOY_BACKEND` selector (D4) |
| `apps/api/src/entrypoints/seed-dev.ts` | `--user-only` flag (D5) |
| `scripts/e2e-up.sh` + `Makefile` (`make e2e` / `make e2e-down`) | new wrapper (spine #3); k3d create + port map, install, `curl -k` asserts, teardown |
| `.github/workflows/e2e.yml` | new; `workflow_run` after CD + `workflow_dispatch` (D6) |
| `docs/local-dev.md` | new; documents both the no-cluster loop (#134 tail) and the with-cluster E2E |
| `README` pointer | link to `docs/local-dev.md` |

---

## Out of scope

- **Real Let's Encrypt issuance** — needs public DNS; un-testable in CI (§ TLS).
- **Multi-node agent-join** testing (`install.sh --agent`) — needs real separate hosts.
- **Build-from-source** deploys — until #31 (example todo-app) exists, deploy a trivial public image.
- `install.sh` arg-validation / `shellcheck` unit-testing — explicitly dropped from the re-scoped #55 (goal is "does the installer *work*"). Re-addable as a cheap first CI step if ever wanted.

## Governance (apexyard)

`--skip-k3s`, `DEPLOY_BACKEND`, and the CI-real-K3s-vs-local-k3d substrate split warrant an **AgDR** in marsa's `docs/agdr/` with the Build phase. `/start-ticket 122` before code edits.

## Risks

- **Real K3s on GitHub runners** — needs passwordless `sudo` (available) + systemd; teardown via `k3s-uninstall.sh`. Spin-up adds ~30–60s vs k3d; acceptable off the merge/dispatch path.
- **GHCR image pull in-cluster** — the E2E cluster must pull `…:<sha>` from GHCR (login / imagePullSecret if private); wrapper concern.
- **Local/CI substrate divergence** — local k3d vs CI real K3s; both K3s, both go through `deploy_marsa`, so low risk.

## Open questions (for spec review)

1. Spec location — `docs/superpowers/specs/` (superpowers default, current) vs a marsa-native `docs/` location?
2. CI trigger — `workflow_run` after CD (proposed) vs a nightly schedule vs both?
