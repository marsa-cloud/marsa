# Least-Mocks E2E Harness + Installer Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one shared spine (`install.sh` + `seed-dev` + a `make e2e` wrapper) that gives least-mocks real-cluster E2E coverage, a real local dev environment, and installer verification — collapsing #55 into #122 and closing #134.

**Architecture:** A k3d/real-K3s cluster runs a real Marsa install via `install.sh`; the api uses the real `DirectApplyDeployBackend`; a sample app is deployed through the API and asserted reachable over HTTPS (`curl -k`). CI runs the full real-K3s path (proves installer + deploy); local dev uses `install.sh --skip-k3s` against disposable k3d. Spec: `docs/superpowers/specs/2026-07-14-least-mocks-e2e-harness-design.md`.

**Tech Stack:** NestJS 11 (Fastify, ESM, Joi config), `node:test`, K3s/k3d, Helm, Traefik IngressRoute, GitHub Actions, bash.

## Global Constraints

- **One ticket at a time; #122 is the active ticket.** Run `/start-ticket 122` before any code edit (apexyard pre-build gate).
- **api is ESM + subpath imports:** `#src/*`, always `.js` extension in specifiers, no relative imports (ESLint error). Import order: side-effects → `node:` → packages → `#src/*` → `#test/*`.
- **api tests:** `node:test` + `node:assert/strict`, run against compiled `dist/` via `pnpm --filter api test` (clean→build→setup→run). No watch mode.
- **Env vars:** every var the api reads is validated in the single Joi schema at `apps/api/src/config/env.config.ts` (AgDR-0020) — add new vars there, not in a local `registerAs`.
- **`install.sh` is user-facing:** only add flags that serve a real user. New flag: `--skip-k3s` only.
- **Format before commit:** `pnpm format` (Prettier is source of truth; CI runs `format:check`).
- **No chart change, no mkcert, no `--tls` flag** — Traefik serves a default self-signed cert; assert with `curl -k`.
- **Commit trailer:** end every commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Baseline:** before Task 2, run `pnpm install` then `pnpm --filter api test` once and confirm green.

---

### Task 1: AgDR for the key technical decisions

**Files:**

- Create: `docs/agdr/AgDR-NNNN-least-mocks-e2e-harness.md` (next free NNNN in `docs/agdr/`)

**Interfaces:**

- Produces: the decision record the merge gate (`require-agdr-for-arch-pr.sh`) expects to be linked from the PR.

- [ ] **Step 1: Find the next AgDR number**

Run: `ls docs/agdr/ | grep -oE 'AgDR-[0-9]+' | sort -V | tail -1`
Use the next integer, zero-padded to 4 digits.

- [ ] **Step 2: Write the AgDR** using `apexyard/templates/agdr.md` structure. Capture three decisions verbatim from the spec: (1) collapse #55 into #122 + close #134; (2) CI = full real-K3s `install.sh`, local = k3d + `--skip-k3s`; (3) `DEPLOY_BACKEND` selector decoupled from `NODE_ENV`. Options-considered table must include the alternatives the spec rejected (k3d-everywhere, real-K3s-everywhere, separate harnesses; `--tls`/mkcert/chart-change — rejected because Traefik self-signs).

- [ ] **Step 3: Commit**

```bash
git add docs/agdr/AgDR-NNNN-least-mocks-e2e-harness.md
git commit -m "docs(#122): AgDR for least-mocks E2E harness decisions

Refs #122

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `DEPLOY_BACKEND` selector (decouple real/mock from `NODE_ENV`)

**Files:**

- Create: `apps/api/src/modules/kubernetes/deploy-backend.selector.ts`
- Create: `apps/api/src/modules/kubernetes/tests/deploy-backend.selector.unit.test.ts`
- Modify: `apps/api/src/modules/kubernetes/kubernetes.module.ts`
- Modify: `apps/api/src/config/env.config.ts` (add `DEPLOY_BACKEND` to Joi schema)

**Interfaces:**

- Produces: `selectDeployBackend(deployBackendEnv: string | undefined, nodeEnv: string): 'mock' | 'direct'` — used by the module factory.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/kubernetes/tests/deploy-backend.selector.unit.test.ts
import { describe, it } from 'node:test'

import { strictEqual } from 'node:assert/strict'

import { selectDeployBackend } from '#src/modules/kubernetes/deploy-backend.selector.js'

describe('selectDeployBackend', () => {
  it('defaults to mock under test when DEPLOY_BACKEND unset', () => {
    strictEqual(selectDeployBackend(undefined, 'test'), 'mock')
  })
  it('defaults to direct outside test when DEPLOY_BACKEND unset', () => {
    strictEqual(selectDeployBackend(undefined, 'production'), 'direct')
  })
  it('honors explicit direct even under NODE_ENV=test', () => {
    strictEqual(selectDeployBackend('direct', 'test'), 'direct')
  })
  it('honors explicit mock even in production', () => {
    strictEqual(selectDeployBackend('mock', 'production'), 'mock')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — `Cannot find module '.../deploy-backend.selector.js'`.

- [ ] **Step 3: Write the selector**

```ts
// apps/api/src/modules/kubernetes/deploy-backend.selector.ts

/**
 * Choose the deploy backend. An explicit DEPLOY_BACKEND wins; otherwise fall
 * back to the historical rule (mock under test, direct everywhere else) so the
 * E2E can run NODE_ENV=test with the real backend without regressing defaults.
 */
export const selectDeployBackend = (
  deployBackendEnv: string | undefined,
  nodeEnv: string,
): 'mock' | 'direct' => {
  if (deployBackendEnv === 'mock' || deployBackendEnv === 'direct') {
    return deployBackendEnv
  }
  return nodeEnv === 'test' ? 'mock' : 'direct'
}
```

- [ ] **Step 4: Wire the selector into the module**

```ts
// apps/api/src/modules/kubernetes/kubernetes.module.ts — replace the useFactory body
import { selectDeployBackend } from '#src/modules/kubernetes/deploy-backend.selector.js'
// ...
      useFactory: (config: ConfigService) =>
        selectDeployBackend(
          config.get<string>('DEPLOY_BACKEND'),
          config.getOrThrow('NODE_ENV'),
        ) === 'mock'
          ? new MockDeployBackend()
          : new DirectApplyDeployBackend(),
```

- [ ] **Step 5: Add `DEPLOY_BACKEND` to the Joi schema**

```ts
// apps/api/src/config/env.config.ts — inside envValidationSchema, after NODE_ENV
  DEPLOY_BACKEND: Joi.string().valid('mock', 'direct').optional(),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS (new selector tests green; existing e2e still green — unset `DEPLOY_BACKEND` keeps mock under test).

- [ ] **Step 7: Format + commit**

```bash
pnpm format
git add apps/api/src/modules/kubernetes/deploy-backend.selector.ts \
        apps/api/src/modules/kubernetes/tests/deploy-backend.selector.unit.test.ts \
        apps/api/src/modules/kubernetes/kubernetes.module.ts \
        apps/api/src/config/env.config.ts
git commit -m "feat(#122): DEPLOY_BACKEND selector decoupled from NODE_ENV

Refs #122

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `seed-dev --user-only`

**Files:**

- Create: `apps/api/src/entrypoints/seed-dev.args.ts`
- Create: `apps/api/src/entrypoints/tests/seed-dev.args.unit.test.ts`
- Modify: `apps/api/src/entrypoints/seed-dev.ts`

**Interfaces:**

- Produces: `parseSeedDevArgs(argv: string[]): { userOnly: boolean }` — consumed by `seed-dev.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/entrypoints/tests/seed-dev.args.unit.test.ts
import { describe, it } from 'node:test'

import { deepStrictEqual } from 'node:assert/strict'

import { parseSeedDevArgs } from '#src/entrypoints/seed-dev.args.js'

describe('parseSeedDevArgs', () => {
  it('defaults userOnly to false', () => {
    deepStrictEqual(parseSeedDevArgs([]), { userOnly: false })
  })
  it('sets userOnly when --user-only present', () => {
    deepStrictEqual(parseSeedDevArgs(['--user-only']), { userOnly: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the arg parser**

```ts
// apps/api/src/entrypoints/seed-dev.args.ts

/** Parse seed-dev flags. `--user-only` seeds the operator + cookie but skips the
 *  fake sample apps (which fake DeployStatus.Succeeded — wrong for the real-deploy E2E). */
export const parseSeedDevArgs = (argv: string[]): { userOnly: boolean } => ({
  userOnly: argv.includes('--user-only'),
})
```

- [ ] **Step 4: Use it in `seed-dev.ts`**

Modify `rawDogFe()` to accept the flag and guard the sample-app loop:

```ts
// near the top of seed-dev.ts imports
import { parseSeedDevArgs } from '#src/entrypoints/seed-dev.args.js'
// ...
async function rawDogFe(): Promise<void> {
  const { userOnly } = parseSeedDevArgs(process.argv.slice(2))
  // ... existing setup + user seeding unchanged ...

  if (!userOnly) {
    for (const slug of SAMPLE_APP_SLUGS) {
      // ... existing sample-app seeding unchanged ...
    }
  }

  await em.flush()
  // ... existing cookie mint + console output unchanged ...
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS.

- [ ] **Step 6: Format + commit**

```bash
pnpm format
git add apps/api/src/entrypoints/seed-dev.args.ts \
        apps/api/src/entrypoints/tests/seed-dev.args.unit.test.ts \
        apps/api/src/entrypoints/seed-dev.ts
git commit -m "feat(#122): seed-dev --user-only (skip fake sample apps)

Refs #122

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `install.sh --skip-k3s` (install into an existing cluster)

**Files:**

- Modify: `scripts/install.sh`
- Create: `scripts/tests/test-install-skip-k3s.sh`

**Interfaces:**

- Produces: `install.sh --skip-k3s` — skips the K3s bootstrap, requires a reachable cluster via `$KUBECONFIG`, runs only Helm-install + `deploy_marsa`.

- [ ] **Step 1: Write the failing test** (PATH-stubbed helm/kubectl/curl; asserts `get.k3s.io` is NOT fetched and helm IS called)

```bash
#!/usr/bin/env bash
# scripts/tests/test-install-skip-k3s.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
stub="$(mktemp -d)"
log="$stub/calls.log"

cat >"$stub/curl" <<EOF
#!/usr/bin/env bash
echo "curl \$*" >>"$log"
case "\$*" in *get.k3s.io*) echo "FAIL: k3s bootstrap attempted under --skip-k3s" >&2; exit 99;; esac
exit 0
EOF
for c in helm kubectl k3s systemctl apt-get; do
  cat >"$stub/$c" <<EOF
#!/usr/bin/env bash
echo "$c \$*" >>"$log"
case "$c:\$1" in helm:version) echo 'v3.18.0';; kubectl:get) echo 'node Ready';; esac
exit 0
EOF
done
chmod +x "$stub"/*

PATH="$stub:$PATH" KUBECONFIG="$stub/kubeconfig" HOME="$stub" \
  bash "$here/../install.sh" --domain marsa.test --skip-k3s --no-tls || true

grep -q 'helm upgrade --install' "$log" || { echo "FAIL: helm install not invoked"; exit 1; }
! grep -q 'get.k3s.io' "$log" || { echo "FAIL: k3s bootstrap ran"; exit 1; }
echo "PASS: --skip-k3s installs via helm without bootstrapping K3s"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/tests/test-install-skip-k3s.sh`
Expected: FAIL — `--skip-k3s` unknown argument (`die "Unknown argument"`).

- [ ] **Step 3: Add the flag + default**

```bash
# scripts/install.sh — in Defaults block
SKIP_K3S="false"          # --skip-k3s: install into an existing cluster (honor $KUBECONFIG)
```

```bash
# scripts/install.sh — in the arg-parsing case, before the *) catch-all
    --skip-k3s)      SKIP_K3S="true"; shift ;;
```

- [ ] **Step 4: Reject `--skip-k3s` in agent mode** (server-only, like the other server flags)

```bash
# scripts/install.sh — in the agent-mode validation block
  [ "$SKIP_K3S" = "false" ] || die "--skip-k3s is not valid in --agent mode"
```

- [ ] **Step 5: Branch the K3s bootstrap in `main()`**

```bash
# scripts/install.sh — replace `install_k3s` call in the server path of main()
  preflight "$@"
  if [ "$SKIP_K3S" = "true" ]; then
    info "Skipping K3s install (--skip-k3s); using existing cluster via \$KUBECONFIG"
    export KUBECONFIG="${KUBECONFIG:-$K3S_KUBECONFIG}"
    kubectl get nodes >/dev/null 2>&1 || die "No reachable cluster at KUBECONFIG=$KUBECONFIG"
  else
    install_k3s
  fi
  install_helm
  deploy_marsa
  summary
```

Note: `deploy_marsa` sets `export KUBECONFIG="$K3S_KUBECONFIG"` unconditionally — change that line to honor an already-exported value: `export KUBECONFIG="${KUBECONFIG:-$K3S_KUBECONFIG}"`.

- [ ] **Step 6: Run test + shellcheck + syntax check**

Run: `bash scripts/tests/test-install-skip-k3s.sh && bash -n scripts/install.sh`
Expected: `PASS: --skip-k3s installs via helm without bootstrapping K3s`, no syntax errors.
(If `shellcheck` is available: `shellcheck scripts/install.sh` — triage any new advisories.)

- [ ] **Step 7: Commit**

```bash
chmod +x scripts/tests/test-install-skip-k3s.sh
git add scripts/install.sh scripts/tests/test-install-skip-k3s.sh
git commit -m "feat(#122): install.sh --skip-k3s (deploy onto existing cluster)

Refs #122

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: k3d E2E wrapper (`scripts/e2e-up.sh` + `Makefile`)

**Files:**

- Create: `scripts/e2e-up.sh`
- Create: `scripts/e2e-down.sh`
- Create/Modify: `Makefile` (`make e2e`, `make e2e-down`)

**Interfaces:**

- Consumes: `install.sh --skip-k3s` (Task 4), `seed-dev --user-only` (Task 3), `DEPLOY_BACKEND=direct` (Task 2).
- Produces: `scripts/e2e-up.sh [--image-tag <tag>]` — brings the full stack up and runs the positive assertions; exit 0 = pass.

> **Integration task — verified by running it, not pure unit TDD.** Iterate `make e2e` locally (k3d) until green. The negative probe (spec § Assertions) is exercised once here, manually.

- [ ] **Step 1: Write `scripts/e2e-up.sh`** — the harness. Concrete shape:

```bash
#!/usr/bin/env bash
# scripts/e2e-up.sh — bring Marsa up on k3d and assert a real deploy over HTTPS.
set -euo pipefail
IMAGE_TAG="latest"; [ "${1:-}" = "--image-tag" ] && IMAGE_TAG="$2"
CLUSTER="marsa-e2e"
BASE_DOMAIN="127.0.0.1.nip.io"          # apps resolve at <slug>.127.0.0.1.nip.io
CHART_REF="${MARSA_CHART_REF:-oci://ghcr.io/marsa-cloud/charts/marsa}"

k3d cluster create "$CLUSTER" -p "80:80@loadbalancer" -p "443:443@loadbalancer" --wait
export KUBECONFIG; KUBECONFIG="$(k3d kubeconfig write "$CLUSTER")"

# Install Marsa via the real installer path (existing cluster).
MARSA_CHART_REF="$CHART_REF" bash scripts/install.sh \
  --domain "$BASE_DOMAIN" --skip-k3s --no-tls \
  # image + base-domain overrides passed through to helm — see Step 2

# Seed an operator + cookie inside the api pod (reuses its DB + AUTH_SESSION_SECRET_KEY).
api_pod="$(kubectl -n marsa get pod -l app=marsa-api -o name | head -1)"
cookie="$(kubectl -n marsa exec "$api_pod" -- node dist/src/entrypoints/seed-dev.js --user-only | grep -oE 'marsa_session=[^ ]+')"

# Deploy a sample app through the real API (self-signed → -k).
curl -k -sf -X POST "https://api.$BASE_DOMAIN/api/v1/deployments/deploy" \
  -H 'Content-Type: application/json' -H "Cookie: $cookie" \
  -d '{"slug":"e2e-app","image":"nginx:1.27","containerPort":80}'

# Assert cluster objects applied.
kubectl -n marsa get deployment e2e-app
kubectl -n marsa get service e2e-app
kubectl -n marsa get ingressroute -A | grep -q e2e-app

# Assert reachable over HTTPS (Traefik default self-signed).
for i in $(seq 1 30); do
  curl -k -sf "https://e2e-app.$BASE_DOMAIN/" >/dev/null && { echo "PASS: app reachable over HTTPS"; exit 0; }
  sleep 2
done
echo "FAIL: app not reachable over HTTPS"; exit 1
```

- [ ] **Step 2: Resolve two integration details while iterating** (these are the parts to expect to adjust):
  - **Image + base-domain passthrough:** the chart needs `MARSA_BASE_DOMAIN=$BASE_DOMAIN` and the api/web `image.tag=$IMAGE_TAG`. Verify the chart's `values.yaml` keys (`workspace/marsa-charts/charts/marsa/values.yaml`) and pass them. If `install.sh` can't pass `--set`, either export via `MARSA_CHART_REF` to a locally-packaged chart+values, or add a minimal `--set-string`-passthrough to `deploy_marsa` (still a real-user feature — keep it generic). Record the choice in the AgDR (Task 1) if it changes `install.sh`.
  - **GHCR pull:** if `…:<sha>` images are private, create an imagePullSecret in the `marsa` namespace before install (`kubectl create secret docker-registry` from `GHCR_TOKEN`).

- [ ] **Step 3: Write `scripts/e2e-down.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
k3d cluster delete "${1:-marsa-e2e}"
```

- [ ] **Step 4: Add Makefile targets**

```makefile
# Makefile
.PHONY: e2e e2e-down
e2e:            ## Bring Marsa up on k3d and run the E2E assertions
	bash scripts/e2e-up.sh $(ARGS)
e2e-down:       ## Tear down the k3d E2E cluster
	bash scripts/e2e-down.sh
```

- [ ] **Step 5: Run it locally until green**

Run: `make e2e` (requires local `k3d`, `kubectl`, `helm`, `curl`).
Expected: `PASS: app reachable over HTTPS`, exit 0. Then `make e2e-down`.

- [ ] **Step 6: Negative probe (one-time, satisfies #122 AC)** — temporarily break the IngressRoute assertion target (e.g. deploy with a slug the harness doesn't assert, or comment out the Service creation path), run `make e2e`, confirm it exits non-zero, then revert. Note the result in the PR description.

- [ ] **Step 7: Commit**

```bash
chmod +x scripts/e2e-up.sh scripts/e2e-down.sh
git add scripts/e2e-up.sh scripts/e2e-down.sh Makefile
git commit -m "feat(#122): k3d E2E wrapper (make e2e / e2e-down)

Refs #122

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `e2e.yml` GitHub Actions workflow (real K3s, after CD)

**Files:**

- Create: `.github/workflows/e2e.yml`

**Interfaces:**

- Consumes: `cd.yml` (its completion event + the `…:<sha>` image it publishes), `scripts/e2e-up.sh` (Task 5), `scripts/install.sh --skip-k3s` (Task 4).

> Study `.github/workflows/deploy.yml` first — it already reads a CD-built image via `workflow_run`; mirror how it derives the head SHA and gates on `conclusion == 'success'`.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/e2e.yml
name: E2E
on:
  workflow_run:
    workflows: ['CD']
    types: [completed]
jobs:
  e2e:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
      - name: Full real-K3s install + E2E
        env:
          IMAGE_TAG: ${{ github.event.workflow_run.head_sha }}
        run: |
          # CI path uses the FULL install.sh (real K3s bootstrap) — proves the installer.
          # Then deploy + HTTPS assertions run against that cluster.
          sudo bash scripts/install.sh --domain 127.0.0.1.nip.io --no-tls
          bash scripts/e2e-up.sh --image-tag "$IMAGE_TAG" --skip-cluster
```

- [ ] **Step 2: Reconcile `e2e-up.sh` for CI reuse** — CI already installed via full `install.sh` (real K3s), so `e2e-up.sh` must support a `--skip-cluster` mode that skips the `k3d cluster create` + its own `install.sh` call and runs only the seed + deploy + assert steps against the current `$KUBECONFIG`. Add that flag to `scripts/e2e-up.sh` (Task 5 file) and factor the assert block into a function both paths call. Re-commit Task 5 files if changed.

- [ ] **Step 3: Validate workflow YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/e2e.yml'))"`
Expected: no error. (Full run is validated post-merge when CD fires.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/e2e.yml scripts/e2e-up.sh
git commit -m "ci(#122): E2E workflow — full real-K3s install after CD

Refs #122

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `docs/local-dev.md` + `pnpm` aliases + README pointer (#134 tail)

**Files:**

- Create: `docs/local-dev.md`
- Modify: root `package.json` (add `seed` + combined `dev` scripts)
- Modify: `README.md` (pointer)

**Interfaces:**

- Consumes: the no-cluster flow already documented in root `.claude/CLAUDE.md`; the `make e2e` flow (Task 5).

- [ ] **Step 1: Add `pnpm` aliases** to root `package.json` `scripts`:

```json
"seed": "node --env-file=apps/api/.env apps/api/dist/src/entrypoints/seed-dev.js",
"dev": "pnpm --parallel --filter api --filter web dev"
```

- [ ] **Step 2: Write `docs/local-dev.md`** — two tiers, lifted from `.claude/CLAUDE.md` "Running the FE locally without a cluster": (1) **no-cluster inner loop** (`docker compose up` + `.env.test` + `pnpm seed` + `pnpm dev`); (2) **with-cluster E2E** (`make e2e` / `make e2e-down`, points at this spec). Explicitly state the no-cluster tier fakes deploys (mock backend) and the cluster tier is where real deploys/domains are tested.

- [ ] **Step 3: Add a README pointer** — one line under a "Local development" heading linking `docs/local-dev.md`.

- [ ] **Step 4: Verify the aliases run**

Run: `pnpm dev --help >/dev/null 2>&1 || true` and confirm `pnpm run` lists `seed` + `dev`: `pnpm run | grep -E 'seed|dev'`.

- [ ] **Step 5: Format + commit**

```bash
pnpm format
git add docs/local-dev.md package.json README.md
git commit -m "docs(#122): local-dev guide + pnpm seed/dev aliases (closes #134 tail)

Refs #122

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: PR + ticket hygiene (human-gated — do NOT auto-execute)

**Not code.** After all tasks green and pushed:

- [ ] Open the PR: `test/122-least-mocks-e2e` → `main`, title `feat(#122): least-mocks E2E harness + installer verification`, body linking the spec + AgDR, with a Glossary and narrative Summary bullets (apexyard PR-quality rule). Include the negative-probe result (Task 5 Step 6).
- [ ] Run `/code-review` (Rex) + address findings; `/design-review` if it flags the design artifact.
- [ ] **These need explicit approval, one per action — surface them, don't self-execute:** collapse **#55** into #122 (comment + close as covered-by-#122), **close #134** (comment referencing this PR's `docs/local-dev.md` + aliases), and any `--set`-passthrough decision recorded back into the AgDR.
- [ ] Merge only via `/approve-merge 122` after an explicit per-PR CEO nod (merge gate).

---

## Self-Review

**Spec coverage:** D1 collapse/close → Tasks 1, 7, 8. D2 substrate split → Tasks 4 (`--skip-k3s`), 5 (k3d), 6 (real-K3s CI). D3 `--skip-k3s` → Task 4. D4 `DEPLOY_BACKEND` → Task 2. D5 `seed-dev --user-only` → Task 3. D6 trigger after CD → Task 6. TLS (self-signed/`curl -k`) → Task 5. Mock boundary → Tasks 2+5. Assertions incl. negative probe → Task 5. Governance AgDR → Task 1. Docs/#134 tail → Task 7. No gaps.

**Placeholder scan:** two integration tasks (5, 6) carry explicitly-flagged "resolve while iterating" items (image/domain passthrough, GHCR pull, `--skip-cluster` reuse) — these are genuine integration unknowns the spec named as wrapper concerns, not lazy TBDs; each states the concrete options and the file to touch.

**Type consistency:** `selectDeployBackend(deployBackendEnv, nodeEnv)` and `parseSeedDevArgs(argv)` signatures match between definition and use. `--skip-k3s`, `--user-only`, `DEPLOY_BACKEND`, `--image-tag`/`--skip-cluster` names are consistent across tasks.
