# Scale-to-zero via KEDA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give KEDA ownership of every Marsa app's replica count so an app can declare `minReplicas: 0`, sleep while idle, and cold-start on the first HTTP request.

**Architecture:** Each app's rendered bundle gains an `HTTPScaledObject` and loses `Deployment.spec.replicas` (KEDA's HPA owns that field). The app's `IngressRoute` points at the shared KEDA HTTP interceptor in the `keda` namespace instead of the app's own Service. There is no serverless-vs-always-on fork: one deploy path, uniformly. Shared cluster components (KEDA core, the HTTP add-on, and the Traefik `allowCrossNamespace` flag) ship from `marsa-charts`.

**Tech Stack:** NestJS 11 (Fastify, ESM, Node 24), Drizzle ORM + drizzle-kit, `@kubernetes/client-node`, Nuxt 4 + Nuxt UI, Helm 3 + helm-unittest, k3s/k3d, KEDA + `keda-add-ons-http`.

**Design spec:** [`docs/superpowers/specs/2026-08-08-scale-to-zero-keda-design.md`](../specs/2026-08-08-scale-to-zero-keda-design.md)
**Decision record:** [`docs/agdr/AgDR-0041-keda-uniform-scaling-ownership.md`](../../agdr/AgDR-0041-keda-uniform-scaling-ownership.md)

## Global Constraints

- **Two PRs, two repos.** `marsa` work lands on branch `feat/119-scale-to-zero-keda` (worktree: `.claude/worktrees/feat+119-scale-to-zero-keda`). `marsa-charts` work lands on `feat/keda-http-addon` (worktree: `../marsa-charts-worktrees/feat-keda-http-addon`). Never mix.
- **Charts land first.** Tasks 2–4 produce the authoritative `HTTPScaledObject` schema that Task 8 renders against. Do not write HSO field names from memory.
- **`Deployment.spec.replicas` must be absent, never `0`.** KEDA's HPA owns that field via the scale subresource; a `marsa-deployer` field manager that keeps declaring it fights KEDA on every redeploy.
- **Run `pnpm format` before every commit** — Prettier is not wired into ESLint and CI runs `format:check` separately.
- **Never `git add -A` / `git add .`** — stage named files only.
- **Commit format:** `type: subject`, with `Refs #119` (not `Closes`) so QA verification stays mandatory.
- **Coverage floors are ratchets** — api lines 80 / branches 75 / functions 75; web lines 88 / statements 88 / branches 85 / functions 60. Add tests, never lower a floor.
- **Constants:** `SCALEDOWN_PERIOD_SECONDS = 300`, `MIN_REPLICAS = 0`, `MAX_REPLICAS = 100`.
- **Interceptor coordinates:** service `keda-add-ons-http-interceptor-proxy`, namespace `keda`, proxy port `8080` — **confirm all three in Task 4**, do not assume.
- **Do not merge without Task 13** (manual k3d cold-start verification). CI cannot prove this feature works.

---

### Task 1: Tracker prerequisites

No code. These artifacts gate later tasks — the migration gate blocks editing migration SQL until a labelled ticket + migration AgDR exist, and the charts branch has no ticket ID.

**Files:** none in this repo (tracker writes + one AgDR in `marsa-charts`).

**Interfaces:**

- Produces: a `marsa-charts` issue number (used to rename the charts branch in Task 2), a `marsa` migration ticket number + migration AgDR path (used in Task 5).

- [ ] **Step 1: Amend #119's acceptance criteria**

The AC "The always-on (`1+`) path is unchanged for existing apps" is false under uniform KEDA — every existing app moves onto the interceptor on its next deploy. Edit it to read:

> - [ ] Existing apps keep their current replica count across the upgrade (`min = max = N`), and move onto the KEDA-managed path on their next deploy — see AgDR-0041.

- [ ] **Step 2: File the marsa-charts issue**

Use the `/task` skill (raw `gh issue create` is blocked by `require-skill-for-issue-create.sh`). Title: `[Task] Ship KEDA core + HTTP add-on and Traefik allowCrossNamespace`. Body must cover: the two subchart dependencies, `interceptor.replicas: 2`, the `HelmChartConfig` restructure, and the `values.schema.json` extension.

- [ ] **Step 3: File the migration ticket + migration AgDR**

Run `/migration` in the `marsa` repo. It produces both artifacts in one flow. Inputs it will ask for:

- **Type:** schema change, destructive (drops a column)
- **Affected tables:** `app`
- **Rollback:** re-add `replicas int not null default 1`, backfill `replicas = min_replicas`, drop `min_replicas` / `max_replicas`. Lossy for any app where `min ≠ max` — state this explicitly.
- **Downtime:** none; `app` is small and all three statements are fast
- **Consumers:** `apps/api` only
- **Data volume:** single-digit rows in practice
- **Testing:** applied by `pnpm --filter api test:setup` on every test run

- [ ] **Step 4: Rename the charts branch to carry the ticket ID**

```bash
cd ../marsa-charts-worktrees/feat-keda-http-addon || exit 1
git branch -m feat/<charts-issue>-keda-http-addon
git rev-parse --abbrev-ref HEAD
```

Expected: `feat/<charts-issue>-keda-http-addon`

- [ ] **Step 5: Start the ticket in this session**

```bash
/start-ticket marsa-cloud/marsa#119
```

---

### Task 2: Charts — KEDA subchart dependencies

**Files:**

- Modify: `charts/marsa/Chart.yaml`
- Modify: `charts/marsa/values.yaml`
- Modify: `charts/marsa/values.schema.json`
- Modify: `.github/workflows/chart-ci.yml`
- Create: `charts/marsa/Chart.lock` (generated)

**Interfaces:**

- Produces: a `keda` values block (`keda.enabled`, `keda-add-ons-http.interceptor.replicas`) consumed by Task 4's install.

- [ ] **Step 1: Add the dependencies**

Append to `charts/marsa/Chart.yaml`:

```yaml
dependencies:
  - name: keda
    version: '2.17.*'
    repository: https://kedacore.github.io/charts
    condition: keda.enabled
  - name: keda-add-ons-http
    version: '0.10.*'
    repository: https://kedacore.github.io/charts
    condition: keda.enabled
```

Also bump `version:` to `0.0.1-alpha.5`.

- [ ] **Step 2: Resolve and pin**

```bash
helm dependency update charts/marsa
```

Expected: `charts/marsa/Chart.lock` written and two `.tgz` files in `charts/marsa/charts/`. Record the **exact resolved `keda-add-ons-http` version** — Task 4 needs it.

Add `charts/marsa/charts/` to `.helmignore` and `.gitignore` if not already ignored; commit `Chart.lock`, not the tarballs.

- [ ] **Step 3: Add the values block**

In `charts/marsa/values.yaml`:

```yaml
# KEDA owns the replica count for every tenant app (AgDR-0041). Disable only if
# the cluster already runs KEDA + the HTTP add-on; Marsa apps will not route
# without them.
keda:
  enabled: true

# Two replicas so a KEDA chart upgrade or a crashed interceptor doesn't black
# out every tenant app at once. No PodDisruptionBudget: on single-node k3s it
# protects nothing and hangs `kubectl drain`.
keda-add-ons-http:
  interceptor:
    replicas:
      min: 2
```

Confirm the replica key against the subchart's own `values.yaml` in Step 2's output before committing — it has differed between add-on versions (`interceptor.replicas` scalar vs `interceptor.replicas.min`).

- [ ] **Step 4: Extend the values schema**

`values.schema.json` has `additionalProperties: false` at the top level, so the chart will refuse to install without this. Add to `properties`:

```json
"keda": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Install KEDA core + the HTTP add-on. Marsa apps are scaled by KEDA and routed through its interceptor (AgDR-0041), so disabling this only makes sense when the cluster already provides both."
    }
  }
},
"keda-add-ons-http": {
  "type": "object",
  "description": "Passthrough values for the keda-add-ons-http subchart. Not validated here — the subchart owns its own schema.",
  "additionalProperties": true
}
```

- [ ] **Step 5: Add the dependency step to CI**

In `.github/workflows/chart-ci.yml`, before the lint/template/test steps:

```yaml
- name: Resolve chart dependencies
  run: helm dependency build charts/marsa
```

`build` (not `update`) so CI honours `Chart.lock`.

- [ ] **Step 6: Verify the chart still renders**

```bash
helm template marsa charts/marsa --set tls.domain=example.com --set email=a@b.com > /dev/null
```

Expected: exits 0, no output.

- [ ] **Step 7: Commit**

```bash
git add charts/marsa/Chart.yaml charts/marsa/Chart.lock charts/marsa/values.yaml charts/marsa/values.schema.json .github/workflows/chart-ci.yml .helmignore
git commit -m "feat: bundle KEDA core and the HTTP add-on as subcharts

Marsa apps are scaled by KEDA (AgDR-0041), so both are required for any
app to route. Conditional on keda.enabled for clusters that already run
them. Interceptor pinned to 2 replicas so a chart upgrade doesn't black
out every tenant app at once.

Refs marsa-cloud/marsa#119"
```

---

### Task 3: Charts — Traefik `allowCrossNamespace`

The riskiest edit in either repo: it changes an existing template on the always-on path.

**Files:**

- Rename: `charts/marsa/templates/cert-resolver.yaml` → `charts/marsa/templates/traefik-config.yaml`
- Create: `charts/marsa/tests/traefik-config_test.yaml`
- Modify: `charts/marsa/tests/__snapshot__/` (regenerated)

**Interfaces:**

- Consumes: nothing.
- Produces: a Traefik instance that accepts cross-namespace `IngressRoute` backends — the precondition for Task 8's rendered IngressRoute.

- [ ] **Step 1: Write the failing test**

Create `charts/marsa/tests/traefik-config_test.yaml`. The second case is the regression test for the silent-404 bug — it is the reason this task exists:

```yaml
suite: traefik config
templates:
  - traefik-config.yaml
tests:
  - it: enables cross-namespace IngressRoute backends
    set:
      tls.enabled: true
      tls.domain: example.com
      email: a@b.com
    asserts:
      - equal:
          path: metadata.name
          value: traefik
      - equal:
          path: metadata.namespace
          value: kube-system
      - matchRegex:
          path: spec.valuesContent
          pattern: "providers\\.kubernetescrd\\.allowCrossNamespace=true"

  - it: still configures Traefik when TLS is disabled
    set:
      tls.enabled: false
      tls.domain: example.com
      email: a@b.com
    asserts:
      - hasDocuments:
          count: 1
      - matchRegex:
          path: spec.valuesContent
          pattern: "providers\\.kubernetescrd\\.allowCrossNamespace=true"
      - notMatchRegex:
          path: spec.valuesContent
          pattern: 'certificatesresolvers'
```

- [ ] **Step 2: Run it to verify it fails**

```bash
helm unittest charts/marsa -f 'tests/traefik-config_test.yaml'
```

Expected: FAIL — `traefik-config.yaml` does not exist yet.

- [ ] **Step 3: Rename and restructure the template**

```bash
git mv charts/marsa/templates/cert-resolver.yaml charts/marsa/templates/traefik-config.yaml
```

Replace its entire contents with:

```yaml
{{/*
k3s installs Traefik via its helm-controller as a HelmChart named `traefik` in
kube-system; the only supported way to customise it is a HelmChartConfig with
that exact name. The match is by name, so this is the single place any Traefik
setting can live — it is NOT additive across files.

Rendered unconditionally: allowCrossNamespace is required for every tenant
app's IngressRoute to reach the KEDA interceptor in the `keda` namespace
(AgDR-0041). Gating it behind tls.enabled would silently drop every app's
backend and serve 404s with nothing visibly wrong in the resources.
*/}}
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    additionalArguments:
      - "--providers.kubernetescrd.allowCrossNamespace=true"
{{- if .Values.tls.enabled }}
      - "--certificatesresolvers.le.acme.email={{ .Values.email }}"
      - "--certificatesresolvers.le.acme.storage=/data/acme.json"
      - "--certificatesresolvers.le.acme.tlschallenge=true"
      - "--certificatesresolvers.le.acme.caServer=https://acme-v02.api.letsencrypt.org/directory"
{{- end }}
```

The CLI flag is used rather than the `providers.kubernetesCRD.allowCrossNamespace` values key because the flag does not depend on which Traefik chart version k3s bundled.

- [ ] **Step 4: Run the test to verify it passes**

```bash
helm unittest charts/marsa -f 'tests/traefik-config_test.yaml'
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Update the existing suites**

```bash
helm unittest charts/marsa
```

If `connection-and-init_test.yaml` referenced `cert-resolver.yaml`, repoint it. Regenerate snapshots with `helm unittest charts/marsa -u` and **read the snapshot diff** — the only expected change is the added `additionalArguments` line.

- [ ] **Step 6: Commit**

```bash
git add charts/marsa/templates/traefik-config.yaml charts/marsa/tests/
git commit -m "feat: allow cross-namespace IngressRoute backends

Tenant IngressRoutes must reach the KEDA interceptor in the keda
namespace, which k3s Traefik rejects by default. The flag joins the
existing HelmChartConfig (only one may exist per name) and the template
is no longer gated on tls.enabled — without it an insecure install would
serve 404s for every app with nothing visibly wrong.

Renamed from cert-resolver.yaml: it is no longer only about certificates.

Refs marsa-cloud/marsa#119"
```

---

### Task 4: Pin the `HTTPScaledObject` schema

The add-on's CRD schema moved between releases (`replicaCount` → `replicas`, `targetPendingRequests` → `scalingMetric.*`). Task 8 must render against the version this chart vendors, not against documentation.

**Files:**

- Modify: `docs/superpowers/specs/2026-08-08-scale-to-zero-keda-design.md` (in the **marsa** repo — record findings there)

**Interfaces:**

- Produces: the exact `HTTPScaledObject` `apiVersion`, `spec` field names, and the interceptor Service name/port consumed by Tasks 7, 8 and 9.

- [ ] **Step 1: Bring up a k3d cluster with the chart**

```bash
MARSA_E2E_HTTP_PORT=8080 bash scripts/e2e-up.sh
export KUBECONFIG="$(k3d kubeconfig write marsa-e2e)"
kubectl -n keda get pods
```

Expected: `keda-operator`, `keda-admission-webhooks`, `keda-metrics-apiserver`, and `keda-add-ons-http-*` pods Running.

- [ ] **Step 2: Read the authoritative CRD schema**

```bash
kubectl get crd httpscaledobjects.http.keda.sh -o jsonpath='{.spec.versions[*].name}'
kubectl explain httpscaledobject.spec --recursive
```

Record verbatim: the served `apiVersion`, and whether the replica range is `spec.replicas.{min,max}` or `spec.replicaCount.{min,max}`; whether the scale target is `spec.scaleTargetRef.{name,kind,apiVersion,service,port}`; whether the host field is `spec.host` (string) or `spec.hosts` (list); the scaledown field name; and the scaling-metric shape.

- [ ] **Step 3: Confirm the interceptor's coordinates**

```bash
kubectl -n keda get svc | grep interceptor
kubectl -n keda get svc keda-add-ons-http-interceptor-proxy -o jsonpath='{.spec.ports[*].name}{" "}{.spec.ports[*].port}'
```

Record the exact Service name and the **proxy** port (not the admin/metrics port).

- [ ] **Step 4: Write the findings into the spec**

In the marsa worktree, replace the "Do not copy field names from this document" paragraph in the design spec with a fenced block holding the real schema and the real interceptor coordinates, prefixed with the resolved add-on version from Task 2 Step 2.

- [ ] **Step 5: Commit (marsa repo)**

```bash
git add docs/superpowers/specs/2026-08-08-scale-to-zero-keda-design.md
git commit -m "docs: pin the HTTPScaledObject schema to the vendored add-on

Refs #119"
```

- [ ] **Step 6: Open the charts PR**

```bash
gh pr create --repo marsa-cloud/marsa-charts \
  --title "feat(#<charts-issue>): ship KEDA and allow cross-namespace Traefik backends" \
  --body-file <(cat <<'EOF'
## Summary
- **Bundles KEDA core + the HTTP add-on as conditional subcharts** — Marsa apps
  are now scaled by KEDA (AgDR-0041), so neither is optional for a working
  install; `keda.enabled: false` exists only for clusters that already run them.
- **Pins the interceptor to 2 replicas** — it sits on the request path of every
  tenant app, so a single-replica rolling upgrade would black out the whole
  cluster's apps. No PDB: on single-node k3s it protects nothing and hangs
  `kubectl drain`.
- **Enables `allowCrossNamespace` on k3s Traefik** — tenant IngressRoutes must
  reach the interceptor in the `keda` namespace, which Traefik rejects by
  default. The flag has to join the *existing* HelmChartConfig because only one
  may exist per name, and the template is no longer gated on `tls.enabled`:
  without it, an insecure install serves 404s for every app with nothing
  visibly wrong in the resources.

## Testing
1. `helm unittest charts/marsa` — includes a new case asserting Traefik is still
   configured when `tls.enabled: false` (the silent-404 regression).
2. `helm template marsa charts/marsa --set tls.domain=example.com --set email=a@b.com`

Refs marsa-cloud/marsa#119

---

## Glossary
| Term | Definition |
|------|------------|
| KEDA | Kubernetes Event-Driven Autoscaling — scales workloads on external signals, including to and from zero. |
| HTTP add-on | KEDA component that scales on HTTP traffic by proxying requests through an interceptor that counts them. |
| Interceptor | The add-on's proxy pod. Holds an inbound request while the target scales 0→1, then forwards it — this is what makes a cold-start request survive rather than 502. |
| `HelmChartConfig` | k3s CRD for customising a bundled chart (here, Traefik). Matched by name, so exactly one may exist per chart. |
| `allowCrossNamespace` | Traefik flag permitting an IngressRoute to reference a Service in another namespace. Off by default in k3s. |
EOF
)
```

---

### Task 5: Split `replicas` into `min_replicas` / `max_replicas`

**Files:**

- Modify: `apps/api/src/app/app-management/entities/app.table.ts`
- Modify: `apps/api/src/app/app-management/entities/app.builder.ts`
- Create: `apps/api/src/sql/drizzle/<timestamp>_split_replicas_into_min_max/migration.sql` (generated, then hand-edited)

**Interfaces:**

- Produces: `App.minReplicas: number`, `App.maxReplicas: number` (the `App.replicas` field is gone); `AppBuilder.withMinReplicas(n)`, `AppBuilder.withMaxReplicas(n)` (`withReplicas` is gone). Every later task uses these names.

- [ ] **Step 1: Update the table definition**

In `app.table.ts`, replace the `replicas` line with:

```ts
  minReplicas: integer('min_replicas').notNull().default(1),
  maxReplicas: integer('max_replicas').notNull().default(1),
```

- [ ] **Step 2: Update the builder**

In `app.builder.ts`, replace `replicas: 1,` in the constructor with `minReplicas: 1,` and `maxReplicas: 1,`, and replace `withReplicas` with:

```ts
  withMinReplicas(minReplicas: number): this {
    this.app.minReplicas = minReplicas
    return this
  }

  withMaxReplicas(maxReplicas: number): this {
    this.app.maxReplicas = maxReplicas
    return this
  }
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm --filter api db:generate --name=split_replicas_into_min_max
```

**If drizzle-kit prompts to treat this as a column rename, decline** — pick "create new column" for both. A rename would map `replicas` onto one column and silently drop the other's data.

- [ ] **Step 4: Hand-author the backfill**

`drizzle-kit generate` does not emit data migrations. Edit the generated `migration.sql` so the `UPDATE` sits between the adds and the drop:

```sql
ALTER TABLE "app" ADD COLUMN "min_replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "max_replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "app" SET "min_replicas" = "replicas", "max_replicas" = "replicas";--> statement-breakpoint
ALTER TABLE "app" DROP COLUMN "replicas";
```

Existing apps become `min = max = N` — their current fixed count, so no app changes size on upgrade.

- [ ] **Step 5: Apply it and confirm the shape**

```bash
pnpm --filter api build && pnpm --filter api test:setup
psql "$DATABASE_URL/marsa_test" -c '\d app'
```

Expected: `min_replicas` and `max_replicas` present, `replicas` absent.

- [ ] **Step 6: Fix the call sites and typecheck**

`withReplicas` is referenced by `render-manifests.unit.test.ts` and the deploy use-cases. Replace each with `withMinReplicas` / `withMaxReplicas`.

```bash
pnpm --filter api typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/app-management/entities/app.table.ts apps/api/src/app/app-management/entities/app.builder.ts apps/api/src/sql/drizzle
git commit -m "feat: split app replicas into a min/max range

KEDA scales every app between a floor and a ceiling, which one column
can't express. Existing apps backfill to min = max = N so nobody's
replica count changes on upgrade.

Refs #119"
```

---

### Task 6: Command fields and cross-field validation

**Files:**

- Modify: `apps/api/src/app/release/use-cases/deploy-app/deploy-app.constants.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-app/deploy-app.command.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-app/deploy-app.command.builder.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-app/deploy-app.use-case.ts`
- Create: `apps/api/src/app/release/use-cases/deploy-app/is-gte-field.validator.ts`
- Create: `apps/api/src/app/release/use-cases/deploy-app/tests/is-gte-field.validator.unit.test.ts`

**Interfaces:**

- Consumes: `AppBuilder.withMinReplicas` / `withMaxReplicas` (Task 5).
- Produces: `DeployAppCommand.minReplicas?: number`, `DeployAppCommand.maxReplicas?: number`; `SCALEDOWN_PERIOD_SECONDS`; `IsGteField(property, options?)`.

- [ ] **Step 1: Write the failing validator test**

Create `tests/is-gte-field.validator.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { validateSync } from 'class-validator'
import { IsGteField } from '#src/app/release/use-cases/deploy-app/is-gte-field.validator.js'

class Range {
  min!: number

  @IsGteField('min')
  max!: number
}

function validate(min: number, max: number) {
  const range = new Range()
  range.min = min
  range.max = max
  return validateSync(range)
}

describe('IsGteField', () => {
  it('accepts a value greater than the referenced field', () => {
    expect(validate(1, 3)).toHaveLength(0)
  })

  it('accepts a value equal to the referenced field', () => {
    expect(validate(2, 2)).toHaveLength(0)
  })

  it('rejects a value below the referenced field', () => {
    const errors = validate(3, 1)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe('max')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter api build && pnpm --filter api exec node --env-file=.env.test --test src/app/release/use-cases/deploy-app/tests/is-gte-field.validator.unit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

Create `is-gte-field.validator.ts`, mirroring the shape of the existing `is-string-record.validator.ts`:

```ts
import {
  buildMessage,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'

/** Validates that this numeric field is >= the value of a sibling field. */
export function IsGteField(property: string, options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isGteField',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [related] = args.constraints as [string]
          const other = (args.object as Record<string, unknown>)[related]
          return typeof value === 'number' && typeof other === 'number' && value >= other
        },
        defaultMessage: buildMessage(
          (prefix) => `${prefix}$property must be greater than or equal to $constraint1`,
          options,
        ),
      },
    })
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter api build && pnpm --filter api exec node --env-file=.env.test --test src/app/release/use-cases/deploy-app/tests/is-gte-field.validator.unit.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Update the constants**

In `deploy-app.constants.ts`, replace the `MIN_REPLICAS` block with:

```ts
/**
 * Replica bounds for a deploy. A floor of 0 is scale-to-zero: KEDA sleeps the
 * app while idle and cold-starts it on the first HTTP request (AgDR-0041). The
 * ceiling guards against an operator exhausting cluster capacity.
 */
export const MIN_REPLICAS = 0
export const MAX_REPLICAS = 100

/**
 * Idle time before KEDA scales an app back to its floor. Platform-wide rather
 * than per-app: per-app scaling config is the correct model but deferred for
 * scope (AgDR-0041).
 */
export const SCALEDOWN_PERIOD_SECONDS = 300
```

- [ ] **Step 6: Replace the command's `replicas` field**

In `deploy-app.command.ts`, swap the `replicas` property for:

```ts
  @ApiPropertyOptional({
    type: 'integer',
    example: 1,
    description: 'Replica floor. 0 lets the app sleep when idle and wake on the first request.',
    minimum: MIN_REPLICAS,
    maximum: MAX_REPLICAS,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_REPLICAS)
  @Max(MAX_REPLICAS)
  minReplicas?: number

  @ApiPropertyOptional({
    type: 'integer',
    example: 1,
    description: 'Replica ceiling. Must be at least the floor, and at least 1.',
    minimum: 1,
    maximum: MAX_REPLICAS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_REPLICAS)
  @IsGteField('minReplicas')
  maxReplicas?: number
```

Import `IsGteField`. Because both are optional, the `IsGteField` check only runs when `maxReplicas` is present; `minReplicas` then defaults to 1 in the use-case, matching the declared `@Min(1)` floor on `maxReplicas`.

- [ ] **Step 7: Update the use-case and its builder**

In `deploy-app.use-case.ts`, replace `.withReplicas(command.replicas ?? 1)` with:

```ts
      .withMinReplicas(command.minReplicas ?? 1)
      .withMaxReplicas(command.maxReplicas ?? Math.max(command.minReplicas ?? 1, 1))
```

Mirror the field rename in `deploy-app.command.builder.ts` (`withMinReplicas` / `withMaxReplicas`).

- [ ] **Step 8: Run the api suite and commit**

```bash
pnpm --filter api test
pnpm format
git add apps/api/src/app/release/use-cases/deploy-app
git commit -m "feat: accept a min/max replica range on deploy

A floor of 0 opts the app into scale-to-zero. The ceiling is validated
against the floor with a new IsGteField decorator — the codebase had no
cross-field validation precedent.

Refs #119"
```

---

### Task 7: Kubernetes module types and constants

**Files:**

- Modify: `apps/api/src/modules/kubernetes/deploy-backend.types.ts`
- Modify: `apps/api/src/modules/kubernetes/deploy-backend.constants.ts`

**Interfaces:**

- Consumes: the schema pinned in Task 4.
- Produces: `HttpScaledObject` type, `RenderedManifests.httpScaledObject`, `IngressRouteService` with optional `namespace`, and the `KEDA_*` / `INTERCEPTOR_*` constants used by Tasks 8 and 9.

- [ ] **Step 1: Add the interceptor and CRD constants**

Append to `deploy-backend.constants.ts` — **substituting the values recorded in Task 4** if they differ:

```ts
/** KEDA HTTP add-on `HTTPScaledObject` CRD coordinates, for `CustomObjectsApi`. */
export const KEDA_HTTP_GROUP = 'http.keda.sh'
export const KEDA_HTTP_VERSION = 'v1alpha1'
export const HTTP_SCALED_OBJECT_PLURAL = 'httpscaledobjects'

/**
 * The add-on's shared interceptor proxy. Every app's IngressRoute points here
 * rather than at the app's own Service: the interceptor holds the request while
 * KEDA scales the app up, which is what makes a cold start survive instead of
 * 502 (AgDR-0041). Cross-namespace, so k3s Traefik needs allowCrossNamespace —
 * shipped by marsa-charts.
 */
export const KEDA_NAMESPACE = 'keda'
export const INTERCEPTOR_SERVICE_NAME = 'keda-add-ons-http-interceptor-proxy'
export const INTERCEPTOR_PORT = 8080
```

- [ ] **Step 2: Add the HSO type and widen the IngressRoute service**

In `deploy-backend.types.ts`, replace the inline service shape in `IngressRouteSpec` and add the HSO type:

```ts
/** A backend of a Traefik `IngressRoute` route. `namespace` targets another namespace (requires Traefik's allowCrossNamespace). */
export interface IngressRouteService {
  name: string
  port: number
  namespace?: string
}
```

Use `IngressRouteService[]` for `routes[].services`. Then:

```ts
/**
 * A KEDA HTTP add-on `HTTPScaledObject` — the CRD that makes an app scalable
 * from zero on HTTP traffic. Shapes match the add-on version vendored by
 * marsa-charts; the schema has changed across releases.
 */
export interface HttpScaledObjectSpec {
  hosts: string[]
  scaleTargetRef: {
    name: string
    kind: string
    apiVersion: string
    service: string
    port: number
  }
  replicas: { min: number; max: number }
  scaledownPeriod: number
}

export type HttpScaledObject = KubernetesObject & { spec: HttpScaledObjectSpec }
```

Add `httpScaledObject: HttpScaledObject` to `RenderedManifests`.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter api typecheck
```

Expected: errors only in `render-manifests.ts` (missing `httpScaledObject`) — Task 8 fixes them.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add apps/api/src/modules/kubernetes/deploy-backend.types.ts apps/api/src/modules/kubernetes/deploy-backend.constants.ts
git commit -m "feat: type the HTTPScaledObject and cross-namespace route backend

Refs #119"
```

---

### Task 8: Render the KEDA bundle

The single most important change in the plan is Step 3's omission of `spec.replicas`.

**Files:**

- Modify: `apps/api/src/app/release/render/render-manifests.ts`
- Modify: `apps/api/src/app/release/render/tests/render-manifests.unit.test.ts`

**Interfaces:**

- Consumes: Task 5's `App.minReplicas`/`maxReplicas`, Task 7's types and constants.
- Produces: `renderManifests(...)` returning `{ deployment, service, ingressRoute, httpScaledObject, imagePullSecret? }`.

- [ ] **Step 1: Write the failing tests**

In `render-manifests.unit.test.ts`, update the shared `render()` helper to use `.withMinReplicas(0).withMaxReplicas(3)`, replace the `expect(deployment.spec?.replicas).toBe(2)` assertion, and update the IngressRoute backend assertion:

```ts
it('omits replicas from the Deployment so KEDA owns the count', () => {
  const { deployment } = render()

  // Not `0` — absent. KEDA's HPA owns spec.replicas via the scale
  // subresource; declaring it here makes every redeploy stomp KEDA's live
  // count and the two field managers fight (AgDR-0041).
  expect(deployment.spec && 'replicas' in deployment.spec).toBe(false)
})

it('routes the IngressRoute through the KEDA interceptor', () => {
  const { ingressRoute } = render()

  expect(ingressRoute.spec.routes[0].services[0]).toEqual({
    name: 'keda-add-ons-http-interceptor-proxy',
    namespace: 'keda',
    port: 8080,
  })
})

it('renders an HTTPScaledObject carrying the replica range', () => {
  const { httpScaledObject } = render()

  expect(httpScaledObject.apiVersion).toBe('http.keda.sh/v1alpha1')
  expect(httpScaledObject.kind).toBe('HTTPScaledObject')
  expect(httpScaledObject.metadata?.name).toBe('my-app')
  expect(httpScaledObject.spec.hosts).toEqual(['my-app.demo.marsa.cc'])
  expect(httpScaledObject.spec.replicas).toEqual({ min: 0, max: 3 })
  expect(httpScaledObject.spec.scaledownPeriod).toBe(300)
  expect(httpScaledObject.spec.scaleTargetRef).toEqual({
    name: 'my-app',
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    service: 'my-app',
    port: 8080,
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter api build && pnpm --filter api exec node --env-file=.env.test --test src/app/release/render/tests/render-manifests.unit.test.ts
```

Expected: FAIL — `httpScaledObject` undefined, `replicas` present.

- [ ] **Step 3: Drop `replicas` from the Deployment**

In `render-manifests.ts`, delete the `replicas: app.replicas,` line from `deployment.spec` entirely. Do not replace it with `replicas: 0`.

- [ ] **Step 4: Repoint the IngressRoute**

Replace the route's `services` array with:

```ts
          services: [
            {
              name: INTERCEPTOR_SERVICE_NAME,
              namespace: KEDA_NAMESPACE,
              port: INTERCEPTOR_PORT,
            },
          ],
```

The app's own Service stays — it is what the HSO points the interceptor at.

- [ ] **Step 5: Render the HTTPScaledObject**

Before the `return`:

```ts
const httpScaledObject: HttpScaledObject = {
  apiVersion: `${KEDA_HTTP_GROUP}/${KEDA_HTTP_VERSION}`,
  kind: 'HTTPScaledObject',
  metadata: { name, labels },
  spec: {
    hosts: [host],
    scaleTargetRef: {
      name,
      kind: 'Deployment',
      apiVersion: 'apps/v1',
      service: name,
      port: app.containerPort,
    },
    replicas: { min: app.minReplicas, max: app.maxReplicas },
    scaledownPeriod: SCALEDOWN_PERIOD_SECONDS,
  },
}
```

Add it to the returned object.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter api build && pnpm --filter api exec node --env-file=.env.test --test src/app/release/render/tests/render-manifests.unit.test.ts
```

Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add apps/api/src/app/release/render
git commit -m "feat: render an HTTPScaledObject and drop Deployment replicas

The Deployment no longer declares spec.replicas at all — KEDA's HPA owns
that field, and a field manager that keeps declaring it fights KEDA on
every redeploy. Traffic now enters through the add-on's interceptor so a
cold-start request is held rather than dropped.

Refs #119"
```

---

### Task 9: Apply and destroy the HSO

**Files:**

- Modify: `apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts`

**Interfaces:**

- Consumes: Task 7's constants, Task 8's `RenderedManifests.httpScaledObject`.

- [ ] **Step 1: Apply the HSO before the IngressRoute**

In `apply()`, destructure `httpScaledObject` and insert its patch **between** the Service and IngressRoute patches:

```ts
// Before the IngressRoute: the interceptor routes by Host from a table
// built out of HSOs, so an IngressRoute that lands first sends traffic to
// an interceptor that has never heard of the host, and it 404s.
await this.custom.patchNamespacedCustomObject(
  {
    group: KEDA_HTTP_GROUP,
    version: KEDA_HTTP_VERSION,
    namespace,
    plural: HTTP_SCALED_OBJECT_PLURAL,
    name: requireName(httpScaledObject, 'HTTPScaledObject'),
    body: httpScaledObject,
    fieldManager: DEPLOY_FIELD_MANAGER,
    force: true,
  },
  ssa,
)
```

- [ ] **Step 2: Delete the HSO after the IngressRoute**

In `destroy()`, insert between the IngressRoute delete and the Deployment delete:

```ts
// After routing stops, before the Deployment: KEDA must not be actively
// managing a Deployment that is being deleted underneath it.
await ignoreNotFound(() =>
  this.custom.deleteNamespacedCustomObject({
    group: KEDA_HTTP_GROUP,
    version: KEDA_HTTP_VERSION,
    namespace,
    plural: HTTP_SCALED_OBJECT_PLURAL,
    name: appName,
  }),
)
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm --filter api typecheck && pnpm format
git add apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts
git commit -m "feat: apply and delete the HTTPScaledObject

Ordering is load-bearing in both directions: the HSO precedes the
IngressRoute on apply so the interceptor knows the host before traffic
arrives, and follows it on destroy so KEDA isn't managing a Deployment
being deleted underneath it.

Refs #119"
```

---

### Task 10: Report an idle app as idle

**Files:**

- Modify: `apps/api/src/app/app-management/use-cases/view-app-health/view-app-health.response.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-health/view-app-health.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-health/view-app-health.module.ts`
- Create: `apps/api/src/app/app-management/use-cases/view-app-health/view-app-health.repository.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-health/tests/view-app-health.use-case.unit.test.ts`

**Interfaces:**

- Consumes: `App.minReplicas` (Task 5).
- Produces: `AppHealthStatus.Idle = 'idle'`; `ViewAppHealthRepository.findAppBySlug(slug): Promise<App | null>`.

- [ ] **Step 1: Write the failing tests**

The existing `build()` helper constructs the use-case with only a backend stub; it now needs a repository stub too. Update it and add:

```ts
function build(health: AppHealth, minReplicas = 1) {
  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.readAppHealth.resolves(health)
  const repository = createStubInstance(ViewAppHealthRepository)
  repository.findAppBySlug.resolves(new AppBuilder().withMinReplicas(minReplicas).build())
  return new ViewAppHealthUseCase(repository, deployBackend)
}

it('reports Idle when a scale-to-zero app is asleep', async () => {
  const usecase = build(
    { found: true, desiredReplicas: 0, availableReplicas: 0, updatedReplicas: 0 },
    0,
  )

  const response = await usecase.execute('my-app')

  expect(response.status).toBe(AppHealthStatus.Idle)
})

it('reports Unavailable when a woken scale-to-zero app has no ready pod', async () => {
  const usecase = build(
    { found: true, desiredReplicas: 1, availableReplicas: 0, updatedReplicas: 1 },
    0,
  )

  const response = await usecase.execute('my-app')

  expect(response.status).toBe(AppHealthStatus.Unavailable)
})

it('reports Unavailable when an always-on app has no ready pod', async () => {
  const usecase = build(
    { found: true, desiredReplicas: 2, availableReplicas: 0, updatedReplicas: 2 },
    1,
  )

  const response = await usecase.execute('my-app')

  expect(response.status).toBe(AppHealthStatus.Unavailable)
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter api build && pnpm --filter api exec node --env-file=.env.test --test src/app/app-management/use-cases/view-app-health/tests/view-app-health.use-case.unit.test.ts
```

Expected: FAIL — `ViewAppHealthRepository` not found.

- [ ] **Step 3: Add the enum member**

In `view-app-health.response.ts`:

```ts
export enum AppHealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Idle = 'idle',
  Unavailable = 'unavailable',
  NotFound = 'not_found',
}
```

- [ ] **Step 4: Add the repository**

Create `view-app-health.repository.ts`, following `redeploy-app.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { appTable, type App } from '#src/app/app-management/entities/app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppHealthRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findAppBySlug(slug: string): Promise<App | null> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app ?? null
  }
}
```

Register it in `view-app-health.module.ts` `providers`.

- [ ] **Step 5: Teach `verdict()` about the floor**

In `view-app-health.use-case.ts`:

```ts
function verdict(health: AppHealth, minReplicas: number): AppHealthStatus {
  if (!health.found) {
    return AppHealthStatus.NotFound
  }
  // Ahead of the arms below: a scale-to-zero app asleep at 0 pods is idle by
  // design, not unavailable (AgDR-0041).
  if (minReplicas === 0 && health.desiredReplicas === 0 && health.availableReplicas === 0) {
    return AppHealthStatus.Idle
  }
  if (health.desiredReplicas > 0 && health.availableReplicas >= health.desiredReplicas) {
    return AppHealthStatus.Healthy
  }
  if (health.availableReplicas > 0) {
    return AppHealthStatus.Degraded
  }
  return AppHealthStatus.Unavailable
}
```

And in `execute()`, load the app first (an unknown slug keeps today's `NotFound` behaviour):

```ts
  async execute(slug: string): Promise<ViewAppHealthResponse> {
    const app = await this.repository.findAppBySlug(slug)
    const health = await this.deployBackend.readAppHealth(OPERATOR_APPS_NAMESPACE, slug)
    return new ViewAppHealthResponse(verdict(health, app?.minReplicas ?? 1), health)
  }
```

- [ ] **Step 6: Run the tests, then the full suite**

```bash
pnpm --filter api build && pnpm --filter api exec node --env-file=.env.test --test src/app/app-management/use-cases/view-app-health/tests/view-app-health.use-case.unit.test.ts
pnpm --filter api test
```

Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add apps/api/src/app/app-management/use-cases/view-app-health
git commit -m "feat: report a sleeping app as idle rather than unavailable

A scale-to-zero app at 0 pods is working as designed. The check sits
ahead of the other arms so it can't fall through to unavailable, and a
woken-but-crashing app still reports unavailable.

Refs #119"
```

---

### Task 11: Regenerate the OpenAPI contract

**Files:**

- Modify: `apps/api/openapi.json` (generated)
- Modify: `apps/web/app/api/types.gen.ts`, `apps/web/app/api/zod.gen.ts` (generated)

- [ ] **Step 1: Regenerate both sides**

```bash
pnpm --filter api generate:openapi
pnpm --filter web generate:api
```

- [ ] **Step 2: Check the diff says what you expect**

```bash
git diff --stat apps/api/openapi.json apps/web/app/api
```

Expected: `DeployAppCommand.replicas` replaced by `minReplicas` + `maxReplicas`; `AppHealthStatus` gains `idle`. Nothing else.

- [ ] **Step 3: Commit**

```bash
git add apps/api/openapi.json apps/web/app/api
git commit -m "chore: regenerate the OpenAPI contract and web types

Refs #119"
```

---

### Task 12: Web — min/max fields and idle copy

**Files:**

- Modify: `apps/web/app/pages/apps/new.vue`
- Modify: `apps/web/app/pages/apps/[slug].vue`
- Modify: `apps/web/app/pages/apps/__tests__/new.nuxt.spec.ts`
- Modify: `apps/web/app/pages/apps/__tests__/[slug].nuxt.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `new.nuxt.spec.ts`, replace the `includes replicas in the command when set` test:

```ts
it('includes the replica range in the command when set', async () => {
  const wrapper = await mountSuspended(NewApp)
  await fillRequiredFields(wrapper)

  const min = wrapper.find('input#minReplicas')
  await min.setValue('0')
  await min.trigger('blur')
  const max = wrapper.find('input#maxReplicas')
  await max.setValue('3')
  await max.trigger('blur')
  await submit(wrapper)

  expect(deployApp).toHaveBeenCalledWith(
    expect.objectContaining({ minReplicas: 0, maxReplicas: 3 }),
  )
})
```

(Reuse whatever helpers the existing spec defines for filling and submitting — do not invent new ones.)

In `[slug].nuxt.spec.ts`:

```ts
it('describes an idle app as sleeping rather than broken', async () => {
  mockHealth({ status: 'idle', availableReplicas: 0, desiredReplicas: 0 })

  const wrapper = await mountSuspended(AppDetail)

  expect(wrapper.text()).toContain('Idle')
  expect(wrapper.text()).toContain('no pods running')
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter web test
```

Expected: FAIL — no `input#minReplicas`, no idle copy.

- [ ] **Step 3: Update the form schema and state**

In `new.vue`, replace the `replicas` schema entry with:

```ts
  minReplicas: z
    .number()
    .int('Must be a whole number')
    .gte(0, 'Must be between 0 and 100')
    .lte(100, 'Must be between 0 and 100')
    .optional(),
  maxReplicas: z
    .number()
    .int('Must be a whole number')
    .gte(1, 'Must be between 1 and 100')
    .lte(100, 'Must be between 1 and 100')
    .optional(),
```

Mirror the rename in the `state` reactive object and in the submit payload spread.

- [ ] **Step 4: Replace the form field**

```vue
<UFormField
  label="Minimum replicas"
  name="minReplicas"
  description="0 lets the app sleep when idle and wake on the first request"
>
            <UInputNumber
              id="minReplicas"
              v-model="state.minReplicas"
              :min="0"
              :max="100"
              placeholder="1"
              class="w-full"
            />
          </UFormField>

<UFormField label="Maximum replicas" name="maxReplicas" description="Defaults to 1">
            <UInputNumber
              id="maxReplicas"
              v-model="state.maxReplicas"
              :min="1"
              :max="100"
              placeholder="1"
              class="w-full"
            />
          </UFormField>
```

- [ ] **Step 5: Add the idle copy to the health card**

In `[slug].vue`, replace the replica-count span with a conditional:

```vue
<span v-if="health.status === 'idle'" class="text-sm text-muted">
              Sleeping — no pods running, wakes on the first request
            </span>
<span v-else class="text-sm text-muted">
              {{ health.availableReplicas }} / {{ health.desiredReplicas }} replicas available
            </span>
```

Add an `idle` entry to `healthStatusColor` (`'neutral'`).

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter web test
```

Expected: PASS, coverage above the floors.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add apps/web/app/pages/apps
git commit -m "feat: collect a replica range and show sleeping apps as idle

Refs #119"
```

---

### Task 13: Verify the cold start on a real cluster

**Required before merge.** `MockDeployBackend` applies nothing, so CI is green on a feature whose entire value is a behaviour only a real cluster exhibits.

- [ ] **Step 1: Open the marsa PR and publish images**

```bash
gh pr create --repo marsa-cloud/marsa \
  --title "feat(#119): scale apps to zero with KEDA" \
  --body-file <(cat <<'EOF'
## Summary
- **KEDA now owns every app's replica count** — the Deployment no longer declares
  `spec.replicas` at all. KEDA's HPA owns that field via the scale subresource, so
  a field manager that kept declaring it would stomp KEDA's live count on every
  redeploy and the two would fight. One deploy path, no serverless fork (AgDR-0041).
- **Apps take a min/max replica range instead of a single count** — a floor of 0
  opts into scale-to-zero. Existing apps migrate to `min = max = N`, so nobody's
  replica count changes on upgrade. Dropping the old column is destructive, hence
  the migration ticket + migration AgDR.
- **Traffic enters through the add-on's interceptor** — it holds a request while
  the app scales 0→1, which is what makes a cold-start request survive instead of
  502ing. Requires the Traefik and KEDA changes in the companion charts PR.
- **A sleeping app reads as `Idle`, not `Unavailable`** — health needed the app's
  own floor to tell "asleep by design" from "down", so the use-case gained a
  repository. A woken-but-crashing app still reports `Unavailable`.

## Testing
1. `pnpm --filter api test` — includes the regression test that `spec.replicas` is
   absent from the rendered Deployment, and the new `Idle` verdict cases.
2. `pnpm --filter web test`
3. **Manual, required:** cold start verified on k3d — see the timings comment below.

## Known gap
A redeploy of a *sleeping* app can't report failure: a 0-replica Deployment
satisfies `Available=True` trivially, so a broken image reports `Succeeded` until
a request wakes it. Accepted for this issue and recorded in AgDR-0041; the
failure surfaces within one request via health + run logs.

Refs #119

---

## Glossary
| Term | Definition |
|------|------------|
| KEDA | Kubernetes Event-Driven Autoscaling — scales workloads on external signals, including to and from zero. |
| `HTTPScaledObject` | The HTTP add-on's CRD binding a hostname to a workload plus a replica range, so HTTP traffic drives scaling. |
| Interceptor | The add-on's proxy pod. Holds an inbound request while the target scales 0→1, then forwards it. |
| Server-side apply (SSA) | Kubernetes apply mode where each field has a recorded owner ("field manager"), so two writers can't silently clobber each other. |
| Field manager | The identity recorded against each field under SSA. Marsa applies as `marsa-deployer`; `spec.replicas` must belong to KEDA instead. |
| Cold start | The first request to a scaled-to-zero app, which waits for a pod to be scheduled, pulled, and ready. |
EOF
)
gh pr edit <pr> --add-label preview
```

- [ ] **Step 2: Read the published tag from the CD run**

```bash
gh run view <run-id> --log | grep -oE 'ghcr.io/marsa-cloud/marsa-(api|web):sha-[a-f0-9]+' | sort -u
```

Do not derive the tag from `git rev-parse` — on a `pull_request` event `github.sha` is the merge commit.

- [ ] **Step 3: Install onto k3d, with the charts branch**

```bash
MARSA_E2E_HTTP_PORT=8080 bash scripts/e2e-up.sh --image-tag sha-<short>
export KUBECONFIG="$(k3d kubeconfig write marsa-e2e)"
```

- [ ] **Step 4: Deploy a scale-to-zero app and watch it sleep**

Deploy through the UI with **min 0 / max 3**, then:

```bash
kubectl -n marsa-apps get deploy <slug> -w
```

Expected: starts at 1 replica (the API server's default for an omitted `spec.replicas`), then drops to **0** within ~5 minutes.

- [ ] **Step 5: Confirm KEDA owns the field, not us**

```bash
kubectl -n marsa-apps get deploy <slug> -o yaml | grep -A5 managedFields | grep -B2 'f:replicas'
```

Expected: `spec.replicas` owned by an HPA-related manager, **never** by `marsa-deployer`. If `marsa-deployer` owns it, Task 8 Step 3 was not applied correctly — stop and fix.

- [ ] **Step 6: Cold-start it**

```bash
time curl -sk -o /dev/null -w '%{http_code}\n' https://<slug>.127.0.0.1.nip.io/
```

Expected: `200`, in roughly 3–30s depending on image pull. Then immediately re-run: expected `200` in well under a second.

- [ ] **Step 7: Check the health card reads Idle**

Wait out the scaledown period, reload the app's detail page. Expected: the `Idle` badge and "Sleeping — no pods running".

- [ ] **Step 8: Confirm an always-on app still works**

Deploy a second app with **min 1 / max 1**. Expected: one pod, stays up, `Healthy`, and its URL serves immediately — the existing-apps path, now through the interceptor.

- [ ] **Step 9: Tear down and record results**

```bash
pnpm e2e:down
```

Post the measured cold-start and warm timings as a PR comment. This is the evidence the QA gate needs.

---

## Post-merge follow-ups to file

1. Per-app `scaledownPeriod` and scaling target — acknowledged as the correct model, deferred for scope.
2. Warm-up request on deploy so a redeploy of a sleeping app can fail at deploy time rather than reporting `Succeeded`.
3. Correct `apps/api/.claude/CLAUDE.md` — it documents MikroORM throughout; the repo is on Drizzle.
4. Revisit `allowCrossNamespace` if tenants ever gain the ability to supply their own manifests.
5. NetworkPolicy allowance from the `keda` namespace, for when project×env namespacing lands.
