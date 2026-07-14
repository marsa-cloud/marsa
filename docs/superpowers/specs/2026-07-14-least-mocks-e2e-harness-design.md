# Least-Mocks E2E Harness + Installer Verification — Design

> In the context of Marsa's testing gap (the real deploy path is never exercised end-to-end), facing three overlapping tickets (#55 installer CI, #122 k3d E2E, #134 fast local stack), we decided to build **one shared spine** — `install.sh` + `seed-dev` + a `make e2e` wrapper — with three thin consumers, to get least-mocks E2E coverage **and** a real local dev environment **and** installer verification without three drifting harnesses.

**Tickets:** collapses **#55** into **#122**; closes **#134** (folding its doc/script tail here). Cross-repo TLS work filed separately against **marsa-charts** (see § Cross-repo scope), tied to marsa-charts#19.

**Status:** design approved (brainstorm), pending spec review → implementation plan.

---

## Problem

Nothing exercises Marsa's real deploy path end-to-end:

- The api's e2e tests wire `MockDeployBackend` (via `NODE_ENV=test`) — no cluster, nothing applied.
- `install.sh` (the production VPS installer) has **no automated test** — a regression in its K3s bootstrap or chart install ships silently.
- The fast local stack (#134) deliberately skips Kubernetes for inner-loop speed.

So a regression in manifest rendering, server-side apply, ingress, TLS, or the chart install would reach production unseen. **Goal: E2E-test Marsa with the least amount of mocks** — and, because a least-mocks test environment *is* a real dev environment, have that same artifact double as the on-demand "test a deploy + dummy domain locally" workflow.

## Key insight

The **least-mocks E2E environment** and the **real local dev environment** are the same artifact. Both need: a real cluster, a real Marsa install, real deploys through the API, and real (dummy) domains over HTTPS. Build it once; CI and a developer at a laptop are two callers of the same spine.

The three tickets don't need three harnesses — they need **one spine with three consumers** that differ only in *which cluster substrate* they use and *how many assertions* run after bring-up.

---

## The spine and its three consumers

**Spine (build once):**

1. **`install.sh`** — cluster (optional) + Helm + `helm upgrade --install` of the Marsa chart. The single chart-install path; never duplicated.
2. **`seed-dev.ts`** — seed a dev operator + mint a valid `@fastify/secure-session` cookie (the auth bypass), reused across consumers.
3. **`scripts/e2e-up.sh` / `make e2e`** — thin wrapper holding all test-*only* concerns (nip.io domain choice, PR-built image injection, mkcert CA trust, teardown).

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

CI = full real K3s (via `install.sh`); local dev = k3d + `install.sh --skip-k3s`. Rationale in the table above. Both substrates are K3s, so chart behaviour is near-identical; only the bootstrap differs (exercised only in CI, which is where it matters).

### D3 — `install.sh` gains two flags, both real user features

Guardrail: **only add installer flags that serve a real user, never test-only ones.** Two pass that bar:

- **`--skip-k3s`** (a.k.a. `--use-existing-cluster`): skip the `curl|sh` K3s bootstrap, honor `$KUBECONFIG`, run only install-Helm + `deploy_marsa`. Real-user value: "deploy Marsa onto a cluster I already run." Lets local dev reuse the *exact* helm path against k3d.
- **`--tls self-signed|provided`** (extends today's binary `--no-tls`): serve HTTPS with a self-signed/provided cert instead of Let's Encrypt. Real-user value: internal domains without public DNS. Required because `--domain *.nip.io` can't pass Let's Encrypt validation. **Chart-dependent — see Cross-repo scope.**

Test-only concerns stay in the wrapper. Both flags are AgDR-worthy (see § Governance).

### D4 — Decouple deploy-backend selection from `NODE_ENV`

`kubernetes.module.ts` currently welds `MockDeployBackend` to `NODE_ENV==='test'`. The E2E needs `NODE_ENV=test` conveniences *with* `DirectApplyDeployBackend`. Introduce an explicit selector (`DEPLOY_BACKEND=direct|mock`) that defaults to the current behaviour when unset (mock under test, direct otherwise) so nothing regresses.

### D5 — `seed-dev --user-only`

`seed-dev.ts` seeds a user + cookie **and** inserts sample `App`/`Release` rows with a *faked* `DeployStatus.Succeeded`. That fake is correct for #134 (no cluster) but is the opposite of "least mocks" for the E2E. Add `--user-only` so the E2E reuses the auth bypass, then deploys apps *for real* through the API.

### D6 — Dummy-domain HTTPS

Wildcard DNS via `<slug>.127.0.0.1.nip.io` → 127.0.0.1; trusted local cert via `mkcert` (CI installs the CA) as Traefik's default cert. Self-signed acceptable for a smoke check.

### D7 — CI trigger: merge-gate + manual only

E2E workflow triggers on **`push` to `main`** (post-merge) + **`workflow_dispatch`** (opt-in pre-flight on a PR branch). **No automatic per-PR run** — the full real-K3s E2E is heavy; running it on every PR touching `scripts/**` or deploy paths would tax PR latency. Regressions are caught at the merge boundary. (If a cheap per-PR gate is ever wanted, the arg-validation matrix bolts on as a fast first step.)

---

## Mock boundary ("least mocks")

| Concern | E2E | Note |
|---|---|---|
| Deploy backend | **REAL** (`DirectApplyDeployBackend` → cluster) | the whole point (D4) |
| DB / Redis / secret cipher | **REAL** | already real in e2e |
| Ingress / TLS / domain | **REAL** (Traefik + mkcert + nip.io) | exercises marsa-charts#19 (D6) |
| App-under-test image | **Prebuilt public image** (e.g. `nginx`) | build-from-source out of scope until #31 todo-app |
| GitHub OAuth login | **Seeded** (`seed-dev --user-only`) | interactive OAuth can't run in CI (D5) |

---

## Assertions

**CI E2E (one job):**

1. `install.sh` (full) completes → Marsa release **Ready** + API `/health` responds. *(← #55's assertion.)*
2. Deploy a sample app through Marsa's API → its Deployment + ClusterIP Service + Traefik IngressRoute are applied to the cluster.
3. The deployed app is **reachable over its domain via HTTPS** (nip.io + mkcert). *(← #122's assertion.)*
4. Green on `main`; **red on a deliberately-broken probe** (e.g. a removed validation line or a broken IngressRoute template) — the negative test that proves the harness actually asserts.

**Local:** same wrapper, k3d substrate, leaves the cluster up for manual poking; explicit teardown command.

---

## Components / artifacts

| Artifact | Change |
|---|---|
| `scripts/install.sh` | `--skip-k3s`, `--tls self-signed\|provided` (D3) |
| `apps/api/src/modules/kubernetes/kubernetes.module.ts` | `DEPLOY_BACKEND` selector (D4) |
| `apps/api/src/entrypoints/seed-dev.ts` | `--user-only` flag (D5) |
| `scripts/e2e-up.sh` + `Makefile` (`make e2e` / `make e2e-down`) | new wrapper (spine #3) |
| `.github/workflows/e2e.yml` | new; `push: main` + `workflow_dispatch` (D7) |
| `docs/local-dev.md` | new; documents both the no-cluster loop (#134 tail) and the with-cluster E2E |
| `README` pointer | link to `docs/local-dev.md` |

---

## Cross-repo scope

The `--tls self-signed|provided` mode (D3) needs the **marsa chart** to render an IngressRoute with a self-signed/provided cert instead of a Let's Encrypt / cert-manager issuer. That lives in **marsa-charts**, not this repo. This spec is **marsa-only**; the chart-side TLS work is filed as a **linked marsa-charts ticket** referencing marsa-charts#19. Until it lands, the E2E can fall back to injecting a mkcert cert as Traefik's default cert out-of-band (wrapper concern).

## Out of scope

- **Multi-node agent-join** testing (`install.sh --agent`) — needs real separate hosts.
- **Build-from-source** deploys — until #31 (example todo-app) exists, use a trivial public image.
- `install.sh` arg-validation / `shellcheck` unit-testing — explicitly dropped from the re-scoped #55 (the goal is "does the installer *work*", not "lint its source"). Re-addable as a cheap first CI step if ever wanted.

## Governance (apexyard)

`--skip-k3s`, the `--tls` mode, `DEPLOY_BACKEND`, and the CI-real-K3s-vs-local-k3d substrate split are technical decisions that warrant an **AgDR** in marsa's `docs/agdr/` before/with the Build phase. `/start-ticket 122` before code edits.

## Risks

- **Real K3s on GitHub runners** — needs passwordless `sudo` (available) + systemd; teardown via `k3s-uninstall.sh`. Spin-up adds ~30–60s vs k3d; acceptable at the merge gate.
- **mkcert CA trust in CI** — the runner must trust the mkcert CA for the HTTPS assertion; wrapper installs it.
- **Local/CI substrate divergence** — local k3d vs CI real K3s; both K3s so low risk, but a "works on my k3d" gap is possible. Both go through `deploy_marsa`, bounding it.
- **PR-image injection** — testing a PR's own api/web images (not published `latest`) needs `--set image.tag` passthrough or a locally-packaged chart; a wrapper concern to design in the plan.

## Open questions (for spec review)

1. Spec location — `docs/superpowers/specs/` (superpowers default) vs a marsa-native `docs/` location?
2. PR-built-image injection mechanism — `helm --set` passthrough via `install.sh`, or wrapper packages a local chart?
3. Confirm marsa-charts TLS work as a separate linked ticket (vs. in-scope here).
