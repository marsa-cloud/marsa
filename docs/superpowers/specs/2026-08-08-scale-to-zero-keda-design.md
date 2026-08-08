# Scale-to-zero via KEDA + HTTP add-on — design

**Ticket:** marsa-cloud/marsa#119 (promoted from the #120 spike)
**Companion decision record:** [AgDR-0043](../../agdr/AgDR-0043-keda-uniform-scaling-ownership.md)
**Repos touched:** `marsa-cloud/marsa`, `marsa-cloud/marsa-charts`

## Summary

Every tenant app's replica count moves from a fixed `Deployment.spec.replicas` to a KEDA
`HTTPScaledObject`. An app declares a `minReplicas`/`maxReplicas` range; `minReplicas: 0`
means the app sleeps while idle and cold-starts on the first HTTP request. There is no
second "serverless" code path — KEDA owns scaling for all apps, uniformly.

## Decisions taken before this design

Settled with the operator during brainstorming; recorded here so the plan doesn't relitigate them.

| Question                                                       | Decision                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Fork a `deploy-serverless-app` use-case, or refactor in place? | Refactor in place. One deploy path.                                                                                  |
| One replica field, or min + max?                               | Two fields, `minReplicas` + `maxReplicas`.                                                                           |
| Vocabulary — "replicas" or "instances"?                        | Keep **replicas**; Marsa does not hide Kubernetes from its users.                                                    |
| Does the always-on path keep a plain Deployment?               | No. KEDA owns every app. Accepted cost: the shared interceptor is on every app's request path.                       |
| Traefik cross-namespace vs per-app `ExternalName`?             | `allowCrossNamespace`. `ExternalName` is rejected — it ages into an SSRF primitive if tenants ever supply manifests. |
| How does an idle app read on the health card?                  | New `AppHealthStatus.Idle`.                                                                                          |
| Where do `scaledownPeriod` / scaling-metric targets live?      | Platform-wide constants in the API. Per-app columns are acknowledged as the _correct_ answer, deferred for scope.    |

## Architecture

### Per-app rendered bundle

`renderManifests()` emits four objects instead of three (plus the optional pull Secret):

| Object             | Change                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| `Deployment`       | **`spec.replicas` omitted entirely** — not `0`.                                 |
| `Service`          | Unchanged. Still the HSO's scale target.                                        |
| `IngressRoute`     | Backend flips to `keda-add-ons-http-interceptor-proxy` in the `keda` namespace. |
| `HTTPScaledObject` | **New.** Host, scale target, `{min, max}`, scaledown period.                    |

**Why `replicas` must be absent rather than zero.** KEDA's HPA writes `spec.replicas`
through the scale subresource, which makes it that field's server-side-apply owner. If the
`marsa-deployer` field manager keeps declaring `replicas`, every redeploy stomps KEDA's live
count back to our value and the two managers fight on each apply. Omitting the field hands
ownership over cleanly. On _create_ the API server defaults the field to `1`, so a brand-new
`min=0` app runs one pod and then idles down once KEDA's HPA takes over — which conveniently
means a first deploy still proves the image works.

**Pinned schema (keda-add-ons-http 0.15.0)**, read from the chart's own CRD rather than from
documentation, since the shape moved between releases:

```yaml
apiVersion: http.keda.sh/v1alpha1 # group http.keda.sh, plural httpscaledobjects
kind: HTTPScaledObject
spec:
  hosts: [<slug>.<baseDomain>] # list, matched against the Host header
  scaleTargetRef:
    name: <slug> # the Deployment
    kind: Deployment
    apiVersion: apps/v1
    service: <slug> # required
    port: <containerPort> # exactly one of port | portName
  replicas: { min: <minReplicas>, max: <maxReplicas> }
  scaledownPeriod: 300
```

`scalingMetric.concurrency.targetValue` **defaults to 100**, so it is omitted entirely — one
fewer platform constant to justify. `targetPendingRequests` is deprecated on this version and
must not be used.

Interceptor coordinates, confirmed from `templates/interceptor/service-proxy.yaml`
(`{{ .Chart.Name }}-{{ .Values.interceptor.proxy.service }}`): Service
**`keda-add-ons-http-interceptor-proxy`**, namespace **`keda`**, port **8080**.

### Ordering

Both apply and destroy are order-sensitive, for different reasons.

**Apply: HSO before IngressRoute.** The interceptor routes by `Host` using a table built from
HSOs. If the IngressRoute lands first, traffic reaches an interceptor that has never heard of
that host and 404s until the HSO catches up.

**Destroy: IngressRoute → HSO → Deployment → Service → Secret.** Routing stops first (the
existing rule), then the HSO, so KEDA is not actively managing a Deployment being deleted
underneath it.

### Request path

```
client → Traefik (TLS terminates here)
       → keda-add-ons-http-interceptor-proxy (ns: keda)   ← cross-namespace ref
       → app Service (ns: marsa-apps) → pod
```

TLS is unaffected: Traefik terminates before backend selection, and the backend hop is plain
HTTP in-cluster either way. The ACME resolver uses **TLS-ALPN-01** (`tlschallenge=true`),
answered by Traefik itself during the handshake — so certificates issue and renew for an app
sitting at zero replicas, with no cold start.

## Data model and API

### Migration (destructive)

```
add min_replicas int not null default 1
add max_replicas int not null default 1
update app set min_replicas = replicas, max_replicas = replicas
drop replicas
```

Existing apps become `min = max = N` — their current fixed count expressed in the new
vocabulary, so no app changes its replica count on upgrade.

The DB layer is **Drizzle** (`drizzle-kit generate` → a timestamped folder under
`src/sql/drizzle/` holding `migration.sql` + `snapshot.json`). Two consequences for the plan:

- `drizzle-kit generate` will see `replicas` gone and two new columns and may offer to treat it
  as a **rename**, which would silently drop one column's data. Take the add/add/drop shape and
  hand-author the backfill `UPDATE` into the generated `migration.sql` between the adds and the
  drop — `generate` does not emit data migrations.
- Dropping a column makes this a migration-gated change under the apexyard gates: a labelled
  `migration` ticket plus a migration AgDR must exist _before_ the migration file is touched.

### Command and validation

- `minReplicas`: 0–100, default 1
- `maxReplicas`: 1–100, default 1
- Cross-field: `maxReplicas >= max(minReplicas, 1)`

`MIN_REPLICAS` drops from 1 to 0. New platform constants: `SCALEDOWN_PERIOD_SECONDS = 300`
and the scaling-metric target. Cross-field validation has no precedent in the codebase; use a
small custom `class-validator` decorator alongside the existing `IsStringRecord`.

### Kubernetes module

- `RenderedManifests` gains `httpScaledObject`.
- `DirectApplyDeployBackend` gains one `CustomObjectsApi` patch and one delete.
- New constants: KEDA group/version/plural, interceptor namespace/service/port.
- `IngressRouteSpec.routes[].services[]` gains optional `namespace`.
- `MockDeployBackend` needs no change — it ignores manifests.

### Web

The single Replicas field becomes two, with a hint on the minimum: _"0 lets the app sleep when
idle and wake on the first request."_ Then regenerate `openapi.json` → `types.gen.ts` /
`zod.gen.ts`; CI drift-checks the result.

## Idle semantics

`ViewAppHealthUseCase` gains a repository to load the `App` (its own feature's aggregate, so
no cross-feature reach), and `verdict()` takes `minReplicas`:

```
!found                                        → NotFound
min === 0 && desired === 0 && available === 0 → Idle      ← new, must precede the arms below
desired > 0 && available >= desired           → Healthy
available > 0                                 → Degraded
otherwise                                     → Unavailable
```

The `Idle` arm sits first so a sleeping app cannot fall through to `Unavailable`. A _broken_
`min=0` app still reports correctly: a request wakes it, KEDA sets `desired=1`, the pod
crashloops, `available=0` → `Unavailable`.

**Logs and deploy-failure need no API change.** At zero pods `listAppPods` returns empty, so
`extractDeployFailure` already returns `null` — it never claims a failure it cannot see — and
`readRunLogs` already returns `null`, rendering the neutral "No logs available." The only
change is web copy: the page already holds the health data, so it can say _"App is idle — no
pods running"_ when the status is `idle`.

### Accepted gap: a redeploy of a sleeping app cannot fail

A 0-replica Deployment satisfies `Available=True` and `NewReplicaSetAvailable` trivially, so
`mapRolloutStatus` returns `Complete` → `DeployStatus.Succeeded`. Redeploying an idle app with
a broken image therefore reports green; nothing is pulled until a request wakes it.

**Accepted.** `Succeeded` means "manifests applied and the Deployment settled" — all the
platform can observe without spending a cold start. The failure surfaces within one request:
health flips to `Unavailable` and the run logs show why.

Rejected alternative: an in-cluster warm-up request after applying a `min=0` app (straight at
the interceptor with the right `Host` header, so no DNS/TLS/egress). It works, but adds a
deploy-time network dependency and a 5–30s cold start to every deploy of a sleeping app, to
buy back a signal that surfaces on its own. Reasonable follow-up, not this issue.

## marsa-charts

### KEDA packaging

KEDA core (2.20.2) and the HTTP add-on (0.15.0) are installed as **their own Helm releases in
the `keda` namespace by `scripts/install.sh`** — not as subcharts of `marsa`. `e2e-up.sh`
delegates to `install.sh --skip-k3s`, so one change covers both the VPS and k3d paths.

Subcharts were the obvious choice and were rejected after reading the upstream charts. Both
ship their CRDs under `templates/crds/` rather than the special `crds/` directory, which means
Helm owns them as ordinary resources. As subcharts of `marsa` that has two sharp consequences:

- `helm uninstall marsa` **deletes the CRDs**, and deleting a CRD cascades to every custom
  resource of that kind **cluster-wide** — wiping `ScaledObject`s that Marsa never created.
- On a cluster that already runs KEDA, `helm install marsa` fails outright with
  "resource already exists and is not owned", because Helm refuses resources it doesn't own.

Neither bites on a dedicated single-node box; both bite on "I have a cluster and want to add
Marsa to it". A separate release also lets KEDA be upgraded without cutting a marsa-charts
release, and makes the already-have-KEDA case a no-op rather than a hard failure.

A third consideration settled it: subcharts always install into the **release** namespace, and
`keda-add-ons-http` hardcodes `.Release.Namespace` with no `namespaceOverride`. As a subchart
the interceptor would land in `marsa`, not `keda`, so the API could no longer hardcode the
interceptor's namespace.

The installer skips KEDA when `--skip-keda` is passed or when the `scaledobjects.keda.sh` CRD
already exists, so it stays idempotent and safe on a cluster that already has it.

### Interceptor availability

The add-on defaults to `interceptor.replicas.min: 3` / `max: 50`. Both are wrong for a
single-node box: three idle proxy pods is wasteful, and a ceiling of 50 on one node is a
hazard if the interceptor's own `ScaledObject` ever scales up under load. The installer sets
**`min: 2`, `max: 4`**.

Two replicas buy nothing against node loss — if the node dies, Traefik and every tenant pod die
with it. They buy the two things that are real on one node: a rolling KEDA upgrade keeps one
replica serving instead of blacking out every app, and a crash or OOM leaves a second pod
answering.

**No PodDisruptionBudget.** On a single node a `minAvailable: 1` PDB protects nothing and makes
`kubectl drain` of the only node hang. Add one if Marsa ever supports multi-node.

### Timeouts are already generous enough

The add-on's `interceptor.responseHeaderTimeout` defaults to 300s and `readinessTimeout`
(the scale-from-zero wait) is disabled by default, so the 5–30s cold start a real image needs
is comfortably inside them. No tuning required — the stacked-timeout risk raised during design
does not materialise on 0.15.0 defaults.

### Traefik configuration — the load-bearing edit

k3s installs Traefik through its built-in helm-controller as a `HelmChart` named `traefik` in
`kube-system`. The only supported way to customise it is a `HelmChartConfig` **with that same
name and namespace**, whose `valuesContent` gets merged in. The match is by name, so there is
exactly one such resource — customisation is not additive across files.

`cert-resolver.yaml` already emits it, wrapped in `{{- if .Values.tls.enabled }}`. Two
consequences:

1. `allowCrossNamespace` has nowhere else to live; it must join that document.
2. The TLS gate must go. Installing with `tls.enabled: false` would render no
   `HelmChartConfig` at all, leaving Traefik's default `allowCrossNamespace: false`, and every
   app's IngressRoute would have its interceptor backend **silently dropped** — 404s with
   nothing obviously wrong in the resources.

So the document renders unconditionally and only the ACME arguments stay conditional:

```yaml
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

`additionalArguments` is used rather than the `providers.kubernetesCRD.*` values key because
the CLI flag does not depend on which Traefik chart version k3s bundled. The file is renamed
(`traefik-config.yaml`) since it is no longer only about certificates.

This is a behaviour change to an existing template on the always-on path — the riskiest single
edit in the charts repo.

### Values surface

A new `keda:` block (`enabled`, interceptor replica count). `values.schema.json` sets
`additionalProperties: false` at every level, so the schema must be extended in the same commit
or the chart refuses to install.

## Testing

| Layer                           | Coverage                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `render-manifests.unit.test.ts` | **`'replicas' in deployment.spec === false`** (the regression test for the SSA-fights-KEDA bug), HSO shape, interceptor-backed IngressRoute |
| `verdict()` unit table          | the new `Idle` arm, and the woken-but-broken case reporting `Unavailable`                                                                   |
| e2e                             | `POST /deploy` with `minReplicas: 0` → 200, persisted range                                                                                 |
| charts                          | snapshot updates, plus a new case asserting the Traefik `HelmChartConfig` **renders with `tls.enabled: false`**                             |

Both repos' coverage floors are ratchets — add tests rather than lowering them.

### The honest gap

None of the above proves cold-start works. `MockDeployBackend` applies nothing, so CI will be
green on a feature whose entire value is a behaviour only a real cluster exhibits.

Real verification is the k3d path in `.claude/CLAUDE.md`: label the PR `preview`, read the
published tag from the CD run, `e2e-up.sh --image-tag sha-<short>`, deploy a `min=0` app, watch
it drop to zero, curl it, watch it wake. **Required before merge, not optional.**

## Out of scope

- Non-HTTP (TCP / queue-driven) scale-to-zero.
- Autoscaling policy tuning beyond the idle timeout and the replica range.
- Per-app scaling configuration — acknowledged as the correct model, deferred for scope.
- A PodDisruptionBudget for the interceptor — meaningless until multi-node.
- Warm-up-on-deploy for sleeping apps.

## Follow-ups worth filing

1. Per-app `scaledownPeriod` / scaling target (the deferred "correct answer").
2. Warm-up request so a redeploy of a sleeping app can fail at deploy time.
3. Revisit `allowCrossNamespace` **if tenants ever gain the ability to supply their own
   manifests** — at that point it lets one tenant route to another's Service, and the
   per-namespace-interceptor model becomes the migration target.
4. NetworkPolicy note for when project×env namespacing lands: a default-deny tenant namespace
   must allow ingress from the `keda` namespace as well as Traefik, or cold starts hang.
