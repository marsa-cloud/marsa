# Self-hosted registry (#78) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a Zot registry inside every Marsa install that build Jobs (PR 2) push to over the
in-cluster Service and nodes pull from as `registry.<domain>`, with retention, read-only pull
credentials, and repo deletion when an app is deleted.

**Architecture:** The marsa-charts chart gains Zot (StatefulSet + PVC + Service + ConfigMap), a
generate-once credentials Secret, an IngressRoute host, and registry env for the api. The api
gains an `ImageRegistry` runtime port (`pullCredentialsFor`, `deleteRepository`) with a Zot adapter
(plain `fetch` against the OCI distribution API) and a mock. `deploy-release` / `update-app` use it
for pull credentials; `delete-app` uses it to delete the app's repo. The installer and e2e scripts
teach TLS-less clusters to trust the registry.

**Tech Stack:** Helm 3/4 + helm-unittest, Zot `zot-minimal:v2.1.21`, NestJS 11, Joi, `node:test` +
`expect` + sinon, bash, k3d / K3s.

**Spec:** `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md` §1 and D1–D3,
D9, D11.

## Global Constraints

- Two PRs, **charts first**: marsa's e2e installs the _published_ chart, so the marsa-charts PR
  must merge and a chart release must be tagged before the marsa PR's e2e can pass.
- Branch in both repos: `feature/78-self-hosted-registry`. PR titles:
  `feat(#78): self-hosted Zot registry` (charts) and `feat(#78): self-hosted registry port and
e2e` (marsa). Every commit and PR ends with the attribution lines from the session reminder.
- Run `/start-ticket marsa-cloud/marsa#78` before the first edit in each repo.
- Zot image: `ghcr.io/project-zot/zot-minimal:v2.1.21`. Service `marsa-registry`, port `5000`.
- Usernames are fixed: `marsa-push` (read/create/update/delete) and `marsa-pull` (read only).
- Retention default: keep the 10 most recently pushed tags per repo (`registry.keepImages`).
- Public pull host: `registry.<tls.domain>`. In-cluster push/admin URL: `http://marsa-registry:5000`
  (same namespace as the api).
- Env vars (api), required only when `MARSA_RUNTIME=kubernetes`: `MARSA_REGISTRY_HOST`,
  `MARSA_REGISTRY_URL`, `MARSA_REGISTRY_PUSH_PASSWORD`, `MARSA_REGISTRY_PULL_PASSWORD`.
- Comments: one line, only the non-obvious why (`.claude/rules/comments.md`). No JSDoc.
- Format only the files you touched with prettier (never repo-wide `pnpm format`); for the api run
  `pnpm --filter api lint` and `pnpm --filter api typecheck`.
- Coverage floors (api 80/75/75) must still pass; never lower them.
- Merge gates: stop before every merge and ask for per-PR approval (`/approve-merge`). Do not tag a
  chart release without explicit approval either.

## Already verified (2026-09-23, local Docker, zot-minimal v2.1.21)

These do not need re-checking; they fix the shapes used below.

- The Zot config in Task 3 passes `zot verify`.
- `marsa-pull` can read (`GET /v2/_catalog` → 200) but a push gets `DENIED` and a manifest
  `DELETE` gets **403**.
- Retention with `keepTags: [{ mostRecentlyPushedCount: 2 }]` removed the two oldest of four tags
  within one GC cycle.
- Delete flow: `GET /v2/<repo>/tags/list` → `{"name":…,"tags":[…]}`; `HEAD
/v2/<repo>/manifests/<tag>` with an OCI/Docker `Accept` list returns `Docker-Content-Digest`;
  `DELETE /v2/<repo>/manifests/<digest>` → **202**. Deleting the last tag removes the repo:
  `tags/list` then returns **404** `NAME_UNKNOWN`, same as a repo that never existed.
- `/livez`, `/readyz`, `/startupz` return 200 without auth; `/v2/` returns 401.

---

## Part A — marsa-charts

Work in a new worktree off `origin/main` of marsa-charts:

```bash
cd /home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa-charts || exit 1
git fetch -q origin main
git worktree add ../marsa-charts-worktrees/78-registry -b feature/78-self-hosted-registry origin/main
cd ../marsa-charts-worktrees/78-registry || exit 1
```

All Part A paths are relative to that worktree. Tests run with the local helm-unittest plugin:
`helm unittest charts/marsa`.

### Task 1: Spike — can a k3d node pull `registry.127.0.0.1.nip.io` through Traefik?

Throwaway: nothing here is committed. This is the one unverified assumption (D2 on TLS-less
clusters). Stop and report to the operator if it fails; do not start Task 2.

**Files:** scratchpad only (`$S` below).

- [ ] **Step 1: Create a k3d cluster that skips TLS verification for the registry host**

```bash
S=/tmp/claude-1000/-home-gomaa-zorin-Github-marsa-workspace-apexyard-workspace-marsa/648d3692-8318-475a-9f08-12797feed9da/scratchpad/k3d-spike
mkdir -p "$S" && cd "$S" || exit 1
cat > registries.yaml <<'EOF'
configs:
  "registry.127.0.0.1.nip.io":
    tls:
      insecure_skip_verify: true
EOF
k3d cluster create zot-spike -p "18080:80@loadbalancer" -p "18443:443@loadbalancer" \
  --registry-config "$S/registries.yaml" --wait
export KUBECONFIG="$(k3d kubeconfig write zot-spike)"
until kubectl get crd ingressroutes.traefik.io >/dev/null 2>&1; do sleep 2; done
```

- [ ] **Step 2: Deploy Zot with the two users**

```bash
{ docker run --rm httpd:2.4-alpine htpasswd -nbB marsa-push pushpw
  docker run --rm httpd:2.4-alpine htpasswd -nbB marsa-pull pullpw; } | grep -v '^$' > htpasswd
cp ../zotcfg/config.json config.json   # the verified config from "Already verified"
kubectl create ns spike
kubectl -n spike create secret generic zot-auth --from-file=htpasswd=htpasswd
kubectl -n spike create configmap zot-config --from-file=config.json=config.json
kubectl -n spike apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: { name: marsa-registry }
spec:
  selector: { matchLabels: { app: marsa-registry } }
  template:
    metadata: { labels: { app: marsa-registry } }
    spec:
      containers:
        - name: zot
          image: ghcr.io/project-zot/zot-minimal:v2.1.21
          ports: [{ containerPort: 5000 }]
          volumeMounts:
            - { name: config, mountPath: /etc/zot/config.json, subPath: config.json }
            - { name: auth, mountPath: /etc/zot/auth }
      volumes:
        - { name: config, configMap: { name: zot-config } }
        - { name: auth, secret: { secretName: zot-auth } }
---
apiVersion: v1
kind: Service
metadata: { name: marsa-registry }
spec: { selector: { app: marsa-registry }, ports: [{ port: 5000 }] }
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata: { name: marsa-registry }
spec:
  entryPoints: [web, websecure]
  routes:
    - match: Host(`registry.127.0.0.1.nip.io`)
      kind: Rule
      services: [{ name: marsa-registry, port: 5000 }]
EOF
kubectl -n spike rollout status deploy/marsa-registry --timeout=120s
```

- [ ] **Step 3: Push from a pod to the in-cluster Service as `marsa-push`**

```bash
kubectl -n spike run push --restart=Never --image=gcr.io/go-containerregistry/crane:debug \
  --command -- sh -c 'crane auth login marsa-registry:5000 -u marsa-push -p pushpw &&
    crane copy --insecure nginx:1.27 marsa-registry:5000/demo:1'
kubectl -n spike wait --for=jsonpath='{.status.phase}'=Succeeded pod/push --timeout=180s
```

Expected: `pod/push condition met`.

- [ ] **Step 4: A node pulls it through `registry.127.0.0.1.nip.io` as `marsa-pull`**

```bash
kubectl -n spike create secret docker-registry pull --docker-server=registry.127.0.0.1.nip.io \
  --docker-username=marsa-pull --docker-password=pullpw
kubectl -n spike run pulled --image=registry.127.0.0.1.nip.io/demo:1 \
  --overrides='{"spec":{"imagePullSecrets":[{"name":"pull"}]}}'
kubectl -n spike wait --for=condition=Ready pod/pulled --timeout=180s
```

Expected: `pod/pulled condition met`.

**PASS:** go on to Task 2. **FAIL** (`ErrImagePull` / `ImagePullBackOff`): capture
`kubectl -n spike describe pod pulled` and `docker exec k3d-zot-spike-server-0 sh -c 'tail -50
/var/lib/rancher/k3s/agent/containerd/containerd.log'`, stop, and report. The fallback only
changes the e2e scripts (Task 10), not the chart.

- [ ] **Step 5: Tear down**

```bash
k3d cluster delete zot-spike
```

### Task 2: Registry values, schema and credentials Secret

**Files:**

- Modify: `charts/marsa/values.yaml`
- Modify: `charts/marsa/values.schema.json`
- Create: `charts/marsa/templates/registry-secrets.yml`
- Test: `charts/marsa/tests/registry_test.yaml`

**Interfaces:**

- Produces: Secret `marsa-registry-secrets` with keys `PUSH_PASSWORD`, `PULL_PASSWORD`, `htpasswd`;
  values `registry.imageTag`, `registry.keepImages`, `registry.storageSize`.

- [ ] **Step 1: Write the failing tests**

`charts/marsa/tests/registry_test.yaml`:

```yaml
suite: registry
templates:
  - registry-secrets.yml
set:
  email: a@b.com
  tls.enabled: true
  tls.domain: example.com
tests:
  - it: generates a push and a pull password
    template: registry-secrets.yml
    asserts:
      - equal:
          path: metadata.name
          value: marsa-registry-secrets
      - matchRegex:
          path: stringData.PUSH_PASSWORD
          pattern: '^[A-Za-z0-9]{32}$'
      - matchRegex:
          path: stringData.PULL_PASSWORD
          pattern: '^[A-Za-z0-9]{32}$'

  - it: writes a bcrypt htpasswd entry for each fixed user
    template: registry-secrets.yml
    asserts:
      - matchRegex:
          path: stringData.htpasswd
          pattern: "(?m)^marsa-push:\\$2[aby]\\$"
      - matchRegex:
          path: stringData.htpasswd
          pattern: "(?m)^marsa-pull:\\$2[aby]\\$"
```

- [ ] **Step 2: Run to verify it fails**

Run: `helm unittest charts/marsa -f 'tests/registry_test.yaml'`
Expected: FAIL — `template "registry-secrets.yml" not found` (or equivalent).

- [ ] **Step 3: Add values, schema and the Secret**

Append to `charts/marsa/values.yaml`:

```yaml
registry:
  imageTag: 'v2.1.21'
  # Zot deletes older tags beyond this count per app, then reclaims their layers online.
  keepImages: 10
  storageSize: '10Gi'
```

In `charts/marsa/values.schema.json`, add `"registry"` to the top-level `required` array and this
entry under `properties`:

```json
"registry": {
  "type": "object",
  "additionalProperties": false,
  "required": ["imageTag", "keepImages", "storageSize"],
  "description": "In-cluster Zot image registry that build Jobs push to and nodes pull from (#78).",
  "properties": {
    "imageTag": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$",
      "description": "Tag of ghcr.io/project-zot/zot-minimal."
    },
    "keepImages": {
      "type": "integer",
      "minimum": 1,
      "description": "Most recently pushed tags kept per app repository; older ones are deleted and their layers reclaimed. Rolling back past this many builds fails at image pull."
    },
    "storageSize": {
      "type": "string",
      "pattern": "^[0-9]+(\\.[0-9]+)?(Ei|Pi|Ti|Gi|Mi|Ki|E|P|T|G|M|k)?$",
      "description": "PVC size for registry storage. Immutable after first install."
    }
  }
}
```

`charts/marsa/templates/registry-secrets.yml`:

```yaml
{{- /*
  Generate-once / reuse-on-upgrade, like marsa-api-secrets. The htpasswd file is reused rather
  than re-hashed so an upgrade doesn't churn the Secret and restart Zot.
*/}}
{{- $existing := lookup "v1" "Secret" .Release.Namespace "marsa-registry-secrets" }}
{{- $push := randAlphaNum 32 }}
{{- $pull := randAlphaNum 32 }}
{{- $htpasswd := "" }}
{{- if $existing }}
{{- $push = index $existing.data "PUSH_PASSWORD" | b64dec }}
{{- $pull = index $existing.data "PULL_PASSWORD" | b64dec }}
{{- $htpasswd = index $existing.data "htpasswd" | b64dec }}
{{- else }}
{{- $htpasswd = printf "%s\n%s\n" (htpasswd "marsa-push" $push) (htpasswd "marsa-pull" $pull) }}
{{- end }}
apiVersion: v1
kind: Secret
metadata:
  name: marsa-registry-secrets
type: Opaque
stringData:
  PUSH_PASSWORD: {{ $push | quote }}
  PULL_PASSWORD: {{ $pull | quote }}
  htpasswd: {{ $htpasswd | quote }}
```

- [ ] **Step 4: Run to verify it passes**

Run: `helm unittest charts/marsa`
Expected: all suites PASS, including `registry`.

- [ ] **Step 5: Commit**

```bash
git add charts/marsa/values.yaml charts/marsa/values.schema.json \
  charts/marsa/templates/registry-secrets.yml charts/marsa/tests/registry_test.yaml
git commit -m "feat: add registry values and generate-once credentials

Refs marsa-cloud/marsa#78"
```

### Task 3: Zot ConfigMap, StatefulSet and Service

**Files:**

- Create: `charts/marsa/templates/_registry.tpl`
- Create: `charts/marsa/templates/registry.yml`
- Modify: `charts/marsa/tests/registry_test.yaml`

**Interfaces:**

- Consumes: `marsa-registry-secrets.htpasswd`, `.Values.registry.*` (Task 2).
- Produces: Service `marsa-registry:5000`, StatefulSet `marsa-registry`, ConfigMap
  `marsa-registry-config`.

- [ ] **Step 1: Add the failing tests**

Change the suite's `templates:` list in `charts/marsa/tests/registry_test.yaml` to:

```yaml
templates:
  - registry-secrets.yml
  - registry.yml
```

and append to `tests:`:

```yaml
- it: keeps the configured number of most recently pushed tags
  template: registry.yml
  documentSelector:
    path: kind
    value: ConfigMap
  set:
    registry.keepImages: 3
  asserts:
    - matchRegex:
        path: data["config.json"]
        pattern: '"mostRecentlyPushedCount": 3'

- it: gives marsa-pull read only and marsa-push full access
  template: registry.yml
  documentSelector:
    path: kind
    value: ConfigMap
  asserts:
    - matchRegex:
        path: data["config.json"]
        pattern: '\{ "users": \["marsa-pull"\], "actions": \["read"\] \}'
    - matchRegex:
        path: data["config.json"]
        pattern: '\{ "users": \["marsa-push"\], "actions": \["read", "create", "update", "delete"\] \}'

- it: runs the pinned zot-minimal image with health probes and a memory cap
  template: registry.yml
  documentSelector:
    path: kind
    value: StatefulSet
  asserts:
    - equal:
        path: spec.template.spec.containers[0].image
        value: ghcr.io/project-zot/zot-minimal:v2.1.21
    - equal:
        path: spec.template.spec.containers[0].readinessProbe.httpGet
        value: { path: /readyz, port: 5000 }
    - equal:
        path: spec.template.spec.containers[0].livenessProbe.httpGet
        value: { path: /livez, port: 5000 }
    - equal:
        path: spec.template.spec.containers[0].resources.limits.memory
        value: 256Mi
    - contains:
        path: spec.template.spec.containers[0].env
        content: { name: GOMEMLIMIT, value: 200MiB }
    - equal:
        path: spec.volumeClaimTemplates[0].spec.resources.requests.storage
        value: 10Gi

- it: exposes the registry in-cluster on port 5000
  template: registry.yml
  documentSelector:
    path: kind
    value: Service
  asserts:
    - equal:
        path: metadata.name
        value: marsa-registry
    - equal:
        path: spec.ports[0].port
        value: 5000
```

- [ ] **Step 2: Run to verify it fails**

Run: `helm unittest charts/marsa -f 'tests/registry_test.yaml'`
Expected: FAIL on the four new cases (`registry.yml` not found).

- [ ] **Step 3: Write the config template and `charts/marsa/templates/registry.yml`**

The config lives in a named template so the StatefulSet can hash it (restarting Zot when
`keepImages` changes) without including its own file, which would recurse.

`charts/marsa/templates/_registry.tpl`:

```yaml
{{- define "marsa.registryConfig" -}}
{
  "distSpecVersion": "1.1.1",
  "storage": {
    "rootDirectory": "/var/lib/registry",
    "gc": true,
    "gcDelay": "1h",
    "gcInterval": "1h",
    "retention": {
      "delay": "24h",
      "policies": [
        {
          "repositories": ["**"],
          "deleteReferrers": true,
          "deleteUntagged": true,
          "keepTags": [{ "mostRecentlyPushedCount": {{ .Values.registry.keepImages }} }]
        }
      ]
    }
  },
  "http": {
    "address": "0.0.0.0",
    "port": "5000",
    "auth": { "htpasswd": { "path": "/etc/zot/auth/htpasswd" } },
    "accessControl": {
      "repositories": {
        "**": {
          "policies": [
            { "users": ["marsa-push"], "actions": ["read", "create", "update", "delete"] },
            { "users": ["marsa-pull"], "actions": ["read"] }
          ],
          "defaultPolicy": []
        }
      }
    }
  },
  "log": { "level": "info" }
}
{{- end }}
```

`charts/marsa/templates/registry.yml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: marsa-registry-config
data:
  config.json: |
    {{- include "marsa.registryConfig" . | nindent 4 }}
---
apiVersion: v1
kind: Service
metadata:
  name: marsa-registry
spec:
  selector:
    app: marsa-registry
  ports:
    - port: 5000
      targetPort: 5000
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: marsa-registry
spec:
  serviceName: marsa-registry
  replicas: 1
  selector:
    matchLabels:
      app: marsa-registry
  template:
    metadata:
      labels:
        app: marsa-registry
      annotations:
        checksum/config: {{ include "marsa.registryConfig" . | sha256sum | trunc 16 | quote }}
    spec:
      containers:
        - name: zot
          image: "ghcr.io/project-zot/zot-minimal:{{ .Values.registry.imageTag }}"
          ports:
            - containerPort: 5000
          env:
            # Keeps the Go heap under the container limit instead of OOM-killing on a large push.
            - name: GOMEMLIMIT
              value: 200MiB
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              memory: 256Mi
          volumeMounts:
            - name: config
              mountPath: /etc/zot/config.json
              subPath: config.json
            - name: auth
              mountPath: /etc/zot/auth
              readOnly: true
            - name: data
              mountPath: /var/lib/registry
          startupProbe:
            httpGet:
              path: /startupz
              port: 5000
            periodSeconds: 5
            failureThreshold: 24
          readinessProbe:
            httpGet:
              path: /readyz
              port: 5000
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /livez
              port: 5000
            periodSeconds: 15
      volumes:
        - name: config
          configMap:
            name: marsa-registry-config
        - name: auth
          secret:
            secretName: marsa-registry-secrets
            items:
              - key: htpasswd
                path: htpasswd
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.registry.storageSize }}
```

- [ ] **Step 4: Run the tests and validate the rendered Zot config**

```bash
helm unittest charts/marsa
helm template x charts/marsa --set email=a@b.com --show-only templates/registry.yml \
  | yq 'select(.kind == "ConfigMap") | .data["config.json"]' > /tmp/zot-config.json
touch /tmp/zot-htpasswd
docker run --rm -v /tmp/zot-config.json:/etc/zot/config.json:ro \
  -v /tmp/zot-htpasswd:/etc/zot/auth/htpasswd:ro \
  ghcr.io/project-zot/zot-minimal:v2.1.21 verify /etc/zot/config.json 2>&1 | tail -1
```

Expected: all suites PASS; the last line contains `"config file is valid"`. (Use the scratchpad
instead of `/tmp` if `yq` output must persist.)

- [ ] **Step 5: Commit**

```bash
git add charts/marsa/templates/_registry.tpl charts/marsa/templates/registry.yml \
  charts/marsa/tests/registry_test.yaml
git commit -m "feat: run Zot as the in-cluster image registry

Refs marsa-cloud/marsa#78"
```

### Task 4: Public pull host and api registry env

**Files:**

- Modify: `charts/marsa/templates/ingress-route.yml`
- Modify: `charts/marsa/templates/configmap.yml`
- Modify: `charts/marsa/templates/deployment.yml`
- Modify: `charts/marsa/tests/registry_test.yaml`

**Interfaces:**

- Produces (api env): `MARSA_REGISTRY_HOST=registry.<domain>`,
  `MARSA_REGISTRY_URL=http://marsa-registry:5000`, `MARSA_REGISTRY_PUSH_PASSWORD`,
  `MARSA_REGISTRY_PULL_PASSWORD`.

- [ ] **Step 1: Add the failing tests**

Change the suite's `templates:` list to:

```yaml
templates:
  - registry-secrets.yml
  - registry.yml
  - ingress-route.yml
  - configmap.yml
  - deployment.yml
```

and append:

```yaml
- it: routes registry.<domain> to the registry
  template: ingress-route.yml
  asserts:
    - contains:
        path: spec.routes
        content:
          match: Host(`registry.example.com`)
          kind: Rule
          services:
            - name: marsa-registry
              port: 5000

- it: tells the api the public pull host and the in-cluster url
  template: configmap.yml
  documentSelector:
    path: metadata.name
    value: marsa-config
  asserts:
    - equal:
        path: data.MARSA_REGISTRY_HOST
        value: registry.example.com
    - equal:
        path: data.MARSA_REGISTRY_URL
        value: http://marsa-registry:5000

- it: hands the api both registry passwords from the generated Secret
  template: deployment.yml
  documentSelector:
    path: metadata.name
    value: marsa-api
  asserts:
    - contains:
        path: spec.template.spec.containers[0].env
        content:
          name: MARSA_REGISTRY_PUSH_PASSWORD
          valueFrom:
            secretKeyRef: { name: marsa-registry-secrets, key: PUSH_PASSWORD }
    - contains:
        path: spec.template.spec.containers[0].env
        content:
          name: MARSA_REGISTRY_PULL_PASSWORD
          valueFrom:
            secretKeyRef: { name: marsa-registry-secrets, key: PULL_PASSWORD }
```

- [ ] **Step 2: Run to verify it fails**

Run: `helm unittest charts/marsa -f 'tests/registry_test.yaml'`
Expected: FAIL on the three new cases.

- [ ] **Step 3: Implement**

In `charts/marsa/templates/ingress-route.yml`, inside the `{{- with .Values.tls.domain }}` block,
after the `api.{{ . }}` route and before `{{- end }}`:

```yaml
- match: Host(`registry.{{ . }}`)
  kind: Rule
  services:
    - name: marsa-registry
      port: 5000
```

In `charts/marsa/templates/configmap.yml`, append to the `marsa-config` data:

```yaml
# Nodes pull built images by this public name; the api and build Jobs push to the Service.
MARSA_REGISTRY_HOST: 'registry.{{ .Values.tls.domain }}'
MARSA_REGISTRY_URL: 'http://marsa-registry:5000'
```

In `charts/marsa/templates/deployment.yml`, append to the `marsa-api` container's `env:` list
(after `MARSA_API_NAMESPACE`):

```yaml
- name: MARSA_REGISTRY_PUSH_PASSWORD
  valueFrom:
    secretKeyRef:
      name: marsa-registry-secrets
      key: PUSH_PASSWORD
- name: MARSA_REGISTRY_PULL_PASSWORD
  valueFrom:
    secretKeyRef:
      name: marsa-registry-secrets
      key: PULL_PASSWORD
```

- [ ] **Step 4: Run to verify it passes**

Run: `helm unittest charts/marsa`
Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add charts/marsa/templates/ingress-route.yml charts/marsa/templates/configmap.yml \
  charts/marsa/templates/deployment.yml charts/marsa/tests/registry_test.yaml
git commit -m "feat: route registry.<domain> and give the api registry credentials

Refs marsa-cloud/marsa#78"
```

### Task 5: Chart version, full chart checks, PR

**Files:**

- Modify: `charts/marsa/Chart.yaml`

- [ ] **Step 1: Bump the chart version**

`version: 0.0.1-alpha.9` → `version: 0.0.1-alpha.10`. If Phase B's chart PR already took
`alpha.10` on `main`, rebase and take the next free one.

- [ ] **Step 2: Run the same checks as Chart CI**

```bash
helm lint charts/marsa --set email=a@b.com
helm unittest charts/marsa
helm template x charts/marsa --set email=a@b.com \
  | docker run --rm -i ghcr.io/yannh/kubeconform:v0.6.7 -strict -ignore-missing-schemas \
      -kubernetes-version 1.32.0 \
      -schema-location default \
      -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
```

Expected: lint `0 chart(s) failed`, unittest all PASS, kubeconform no errors.

- [ ] **Step 3: Install it on k3d to smoke-test the real thing**

```bash
k3d cluster create charts-78 --wait
export KUBECONFIG="$(k3d kubeconfig write charts-78)"
until kubectl get crd ingressroutes.traefik.io >/dev/null 2>&1; do sleep 2; done
helm upgrade --install marsa charts/marsa -n marsa --create-namespace \
  --set email=a@b.com --set tls.enabled=false --set tls.domain=127.0.0.1.nip.io
kubectl -n marsa rollout status statefulset/marsa-registry --timeout=180s
kubectl -n marsa get secret marsa-registry-secrets -o jsonpath='{.data.htpasswd}' | base64 -d | cut -d: -f1
k3d cluster delete charts-78
```

Expected: the rollout completes and the last command prints `marsa-push` and `marsa-pull`. (The
api pod will crash-loop against the old image if it already requires the new env; only the
registry is checked here.)

- [ ] **Step 4: Commit and open the PR**

```bash
git add charts/marsa/Chart.yaml
git commit -m "chore: bump chart to 0.0.1-alpha.10

Refs marsa-cloud/marsa#78"
git push -u origin feature/78-self-hosted-registry
gh pr create --repo marsa-cloud/marsa-charts --title "feat(#78): self-hosted Zot registry" \
  --body-file <scratchpad>/charts-pr-body.md
```

The PR body has Summary (narrative bullets: what changed and why), Testing, `Refs
marsa-cloud/marsa#78`, and a Glossary (Zot, htpasswd, retention policy, OCI distribution API,
generate-once Secret). Then run `/code-review` and stop at the merge gate. After merge, the release
tag `v0.0.1-alpha.10` needs its own explicit approval.

---

## Part B — marsa

Work in the Phase C worktree, stacked on the spec branch:

```bash
cd /home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa-worktrees/phase-c || exit 1
git checkout -b feature/78-self-hosted-registry
pnpm install --frozen-lockfile
```

Paths below are relative to that worktree. Api tests run from compiled output:
`pnpm --filter api test` (Postgres must be up: `docker compose up -d`).

### Task 6: Registry env vars, required only on the Kubernetes runtime

**Files:**

- Modify: `apps/api/src/config/env.config.ts`
- Test: `apps/api/src/config/tests/env.config.unit.test.ts`

**Interfaces:**

- Produces: validated `MARSA_REGISTRY_HOST`, `MARSA_REGISTRY_URL`, `MARSA_REGISTRY_PUSH_PASSWORD`,
  `MARSA_REGISTRY_PULL_PASSWORD` (read by Task 7's module wiring).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { envValidationSchema } from '#src/config/env.config.js'

const base = {
  DATABASE_URL: 'postgresql://marsa:marsa@localhost:5432',
  DB_NAME: 'marsa',
  APP_SECRETS_ENCRYPTION_KEY: 'k',
  AUTH_SESSION_SECRET_KEY: 'k',
  MARSA_WEB_URL: 'https://demo.marsa.cc',
  MARSA_API_PUBLIC_URL: 'https://api.demo.marsa.cc',
  MARSA_BASE_DOMAIN: 'demo.marsa.cc',
}

const registry = {
  MARSA_REGISTRY_HOST: 'registry.demo.marsa.cc',
  MARSA_REGISTRY_URL: 'http://marsa-registry:5000',
  MARSA_REGISTRY_PUSH_PASSWORD: 'push',
  MARSA_REGISTRY_PULL_PASSWORD: 'pull',
}

describe('envValidationSchema registry settings', () => {
  it('requires them on the default kubernetes runtime', () => {
    const { error } = envValidationSchema.validate(base)

    expect(error?.message).toContain('MARSA_REGISTRY_HOST')
  })

  it('accepts them on the kubernetes runtime', () => {
    const { error } = envValidationSchema.validate({ ...base, ...registry })

    expect(error).toBeUndefined()
  })

  it('does not require them on the mock runtime', () => {
    const { error } = envValidationSchema.validate({ ...base, MARSA_RUNTIME: 'mock' })

    expect(error).toBeUndefined()
  })

  it('rejects a registry host with a scheme', () => {
    const { error } = envValidationSchema.validate({
      ...base,
      ...registry,
      MARSA_REGISTRY_HOST: 'https://registry.demo.marsa.cc',
    })

    expect(error?.message).toContain('MARSA_REGISTRY_HOST')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test`
Expected: the first and fourth cases FAIL (no registry keys in the schema yet).

- [ ] **Step 3: Add the keys**

In `apps/api/src/config/env.config.ts`, above `export const envValidationSchema`:

```ts
const requiredOnKubernetes = <T extends Joi.Schema>(schema: T): T =>
  schema.when('MARSA_RUNTIME', { is: 'kubernetes', then: Joi.required() }) as T
```

and inside the object, after `MARSA_API_NAMESPACE`:

```ts
  // Public pull host (`registry.<domain>`, no scheme) and the in-cluster url pushes go to (#78).
  MARSA_REGISTRY_HOST: requiredOnKubernetes(Joi.string().hostname()),
  MARSA_REGISTRY_URL: requiredOnKubernetes(Joi.string().uri({ scheme: ['http', 'https'] })),
  MARSA_REGISTRY_PUSH_PASSWORD: requiredOnKubernetes(Joi.string()),
  MARSA_REGISTRY_PULL_PASSWORD: requiredOnKubernetes(Joi.string()),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter api test`
Expected: PASS (the whole suite still passes: `.env.test` uses `MARSA_RUNTIME=mock`). If the
first case still passes validation, Joi is not seeing the defaulted `MARSA_RUNTIME` through the
reference: change the condition to
`schema.when('MARSA_RUNTIME', { is: Joi.valid('mock'), then: Joi.optional(), otherwise: Joi.required() })`
so a missing value means Kubernetes, then re-run.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write apps/api/src/config/env.config.ts apps/api/src/config/tests/env.config.unit.test.ts
git add apps/api/src/config/env.config.ts apps/api/src/config/tests/env.config.unit.test.ts
git commit -m "feat: validate registry settings on the kubernetes runtime

Refs #78"
```

### Task 7: `ImageRegistry` port, Zot adapter, mock, wiring

**Files:**

- Create: `apps/api/src/modules/runtime/image-registry.ts`
- Create: `apps/api/src/modules/runtime/adapters/zot/zot-image-registry.ts`
- Create: `apps/api/src/modules/runtime/adapters/zot/tests/zot-image-registry.unit.test.ts`
- Create: `apps/api/src/modules/runtime/adapters/mock/mock-image-registry.ts`
- Modify: `apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts`
- Modify: `apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts`
- Modify: `.claude/rules/api/runtime.md`

**Interfaces:**

- Produces:

  ```ts
  export abstract class ImageRegistry {
    abstract pullCredentialsFor(imageRef: string): RegistryCredentials | undefined
    abstract deleteRepository(appSlug: string): Promise<void>
  }
  export interface ZotRegistryConfig {
    host: string
    url: string
    pushPassword: string
    pullPassword: string
  }
  export class ZotImageRegistry extends ImageRegistry {
    constructor(config: ZotRegistryConfig, fetchFn?: typeof fetch)
  }
  export class MockImageRegistry extends ImageRegistry {
    readonly deletedRepositories: string[]
    failNextDelete(error: Error): void
  }
  ```

- [ ] **Step 1: Write the port**

`apps/api/src/modules/runtime/image-registry.ts`:

```ts
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

export abstract class ImageRegistry {
  // Undefined for an image outside Marsa's registry, so the app's own credentials apply.
  abstract pullCredentialsFor(imageRef: string): RegistryCredentials | undefined

  // Idempotent: a repository that never existed or is already gone counts as deleted.
  abstract deleteRepository(appSlug: string): Promise<void>
}
```

- [ ] **Step 2: Write the failing adapter tests**

`apps/api/src/modules/runtime/adapters/zot/tests/zot-image-registry.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { type SinonStub, stub } from 'sinon'
import { ZotImageRegistry } from '#src/modules/runtime/adapters/zot/zot-image-registry.js'

const config = {
  host: 'registry.demo.marsa.cc',
  url: 'http://marsa-registry:5000/',
  pushPassword: 'push-pw',
  pullPassword: 'pull-pw',
}

type Route = (init: RequestInit) => Response

function registryWith(routes: Record<string, Route>) {
  const fetchFn: SinonStub = stub().callsFake((url: string, init: RequestInit) => {
    const route = routes[`${init.method} ${url}`]
    return Promise.resolve(route ? route(init) : new Response(null, { status: 404 }))
  })
  return { registry: new ZotImageRegistry(config, fetchFn as typeof fetch), fetchFn }
}

const tags =
  (...names: string[]): Route =>
  () =>
    Response.json({ name: 'my-app', tags: names })
const digest =
  (value: string): Route =>
  () =>
    new Response(null, { status: 200, headers: { 'Docker-Content-Digest': value } })
const accepted: Route = () => new Response(null, { status: 202 })
const base = 'http://marsa-registry:5000/v2/my-app'

describe('ZotImageRegistry.pullCredentialsFor', () => {
  const { registry } = registryWith({})

  it('returns the read-only pull credentials for an image in Marsa registry', () => {
    expect(registry.pullCredentialsFor('registry.demo.marsa.cc/my-app:abc')).toEqual({
      registry: 'registry.demo.marsa.cc',
      username: 'marsa-pull',
      password: 'pull-pw',
    })
  })

  it('returns nothing for an image elsewhere', () => {
    expect(registry.pullCredentialsFor('ghcr.io/org/app:1')).toBeUndefined()
  })

  it('does not match a host that merely starts with the registry host', () => {
    expect(registry.pullCredentialsFor('registry.demo.marsa.cc.evil.io/app:1')).toBeUndefined()
  })
})

describe('ZotImageRegistry.deleteRepository', () => {
  it('deletes the manifest behind every tag, authenticated as marsa-push', async () => {
    const { registry, fetchFn } = registryWith({
      [`GET ${base}/tags/list`]: tags('a', 'b'),
      [`HEAD ${base}/manifests/a`]: digest('sha256:aaa'),
      [`HEAD ${base}/manifests/b`]: digest('sha256:bbb'),
      [`DELETE ${base}/manifests/sha256:aaa`]: accepted,
      [`DELETE ${base}/manifests/sha256:bbb`]: accepted,
    })

    await registry.deleteRepository('my-app')

    const calls = fetchFn.getCalls().map((call) => `${call.args[1].method} ${call.args[0]}`)
    expect(calls).toContain(`DELETE ${base}/manifests/sha256:aaa`)
    expect(calls).toContain(`DELETE ${base}/manifests/sha256:bbb`)
    const authorization = (fetchFn.firstCall.args[1].headers as Record<string, string>)
      .Authorization
    expect(authorization).toBe(`Basic ${Buffer.from('marsa-push:push-pw').toString('base64')}`)
  })

  it('treats a repository the registry does not know as already deleted', async () => {
    const { registry, fetchFn } = registryWith({})

    await registry.deleteRepository('my-app')

    expect(fetchFn.callCount).toBe(1)
  })

  it('skips a tag whose manifest another tag already deleted', async () => {
    const { registry, fetchFn } = registryWith({
      [`GET ${base}/tags/list`]: tags('a', 'b'),
      [`HEAD ${base}/manifests/a`]: digest('sha256:same'),
      [`DELETE ${base}/manifests/sha256:same`]: accepted,
    })

    await registry.deleteRepository('my-app')

    const deletes = fetchFn.getCalls().filter((call) => call.args[1].method === 'DELETE')
    expect(deletes).toHaveLength(1)
  })

  it('fails loudly when the registry refuses', async () => {
    const { registry } = registryWith({
      [`GET ${base}/tags/list`]: () => new Response(null, { status: 403 }),
    })

    await expect(registry.deleteRepository('my-app')).rejects.toThrow(
      "Registry could not list the tags of 'my-app': HTTP 403",
    )
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — cannot find module `zot-image-registry.js` (the build step fails first; that is
the expected red).

- [ ] **Step 4: Write the adapter**

`apps/api/src/modules/runtime/adapters/zot/zot-image-registry.ts`:

```ts
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'
import { stripTrailingSlash } from '#src/utils/strip-trailing-slash.js'

export const REGISTRY_PUSH_USER = 'marsa-push'
export const REGISTRY_PULL_USER = 'marsa-pull'

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

export interface ZotRegistryConfig {
  host: string
  url: string
  pushPassword: string
  pullPassword: string
}

export class ZotImageRegistry extends ImageRegistry {
  private readonly url: string
  private readonly authorization: string

  constructor(
    private readonly config: ZotRegistryConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super()
    this.url = stripTrailingSlash(config.url)
    const token = Buffer.from(`${REGISTRY_PUSH_USER}:${config.pushPassword}`).toString('base64')
    this.authorization = `Basic ${token}`
  }

  pullCredentialsFor(imageRef: string): RegistryCredentials | undefined {
    if (!imageRef.startsWith(`${this.config.host}/`)) {
      return undefined
    }
    return {
      registry: this.config.host,
      username: REGISTRY_PULL_USER,
      password: this.config.pullPassword,
    }
  }

  async deleteRepository(appSlug: string): Promise<void> {
    for (const tag of await this.listTags(appSlug)) {
      const digest = await this.digestOf(appSlug, tag)
      if (digest) {
        await this.deleteManifest(appSlug, digest)
      }
    }
  }

  private async listTags(repository: string): Promise<string[]> {
    const response = await this.request('GET', `/v2/${repository}/tags/list`)
    if (response.status === 404) {
      return []
    }
    assertOk(response, `list the tags of '${repository}'`)
    const body = (await response.json()) as { tags?: string[] | null }
    return body.tags ?? []
  }

  // Null when an earlier delete already removed a manifest this tag shared.
  private async digestOf(repository: string, tag: string): Promise<string | null> {
    const response = await this.request('HEAD', `/v2/${repository}/manifests/${tag}`, {
      Accept: MANIFEST_ACCEPT,
    })
    if (response.status === 404) {
      return null
    }
    assertOk(response, `resolve '${repository}:${tag}'`)
    const digest = response.headers.get('docker-content-digest')
    if (!digest) {
      throw new Error(`Registry returned no digest for '${repository}:${tag}'`)
    }
    return digest
  }

  private async deleteManifest(repository: string, digest: string): Promise<void> {
    const response = await this.request('DELETE', `/v2/${repository}/manifests/${digest}`)
    if (response.status === 404) {
      return
    }
    assertOk(response, `delete '${repository}@${digest}'`)
  }

  private request(method: string, path: string, headers: Record<string, string> = {}) {
    return this.fetchFn(`${this.url}${path}`, {
      method,
      headers: { Authorization: this.authorization, ...headers },
    })
  }
}

function assertOk(response: Response, action: string): void {
  if (!response.ok) {
    throw new Error(`Registry could not ${action}: HTTP ${response.status}`)
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter api test`
Expected: the seven `ZotImageRegistry` cases PASS.

- [ ] **Step 6: Write the mock and wire both adapter modules**

`apps/api/src/modules/runtime/adapters/mock/mock-image-registry.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class MockImageRegistry extends ImageRegistry {
  readonly deletedRepositories: string[] = []
  private armedFailure: Error | null = null

  failNextDelete(error: Error): void {
    this.armedFailure = error
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pullCredentialsFor(_imageRef: string): RegistryCredentials | undefined {
    return undefined
  }

  deleteRepository(appSlug: string): Promise<void> {
    const failure = this.armedFailure
    this.armedFailure = null
    if (failure) {
      return Promise.reject(failure)
    }
    this.deletedRepositories.push(appSlug)
    return Promise.resolve()
  }
}
```

In `apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts`, import `ImageRegistry`
and `MockImageRegistry`, add `{ provide: ImageRegistry, useClass: MockImageRegistry }` to
`providers`, and add `ImageRegistry` to `exports`.

In `apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts`, import
`ImageRegistry` and `ZotImageRegistry`, add to `providers`:

```ts
    {
      // Zot runs in the same cluster as the apps, so this adapter ships with the Kubernetes one.
      provide: ImageRegistry,
      useFactory: (config: ConfigService) =>
        new ZotImageRegistry({
          host: config.getOrThrow<string>('MARSA_REGISTRY_HOST'),
          url: config.getOrThrow<string>('MARSA_REGISTRY_URL'),
          pushPassword: config.getOrThrow<string>('MARSA_REGISTRY_PUSH_PASSWORD'),
          pullPassword: config.getOrThrow<string>('MARSA_REGISTRY_PULL_PASSWORD'),
        }),
      inject: [ConfigService],
    },
```

and add `ImageRegistry` to `exports`.

- [ ] **Step 7: Update the runtime rule**

In `.claude/rules/api/runtime.md`, change the first paragraph's port list to
"(`AppRuntime`, `EnvironmentRuntime`, `NodeRuntime`, `ImageRegistry`)" and add under
"## Only an adapter imports its client library":

```markdown
`ImageRegistry` is implemented by `adapters/zot/` and bound by the Kubernetes adapter module,
because Zot is installed into the same cluster. It speaks plain `fetch` to the OCI distribution
API; no registry client library is imported.
```

- [ ] **Step 8: Verify and commit**

```bash
pnpm --filter api lint && pnpm --filter api typecheck && pnpm --filter api test
pnpm exec prettier --write apps/api/src/modules/runtime/image-registry.ts \
  apps/api/src/modules/runtime/adapters/zot apps/api/src/modules/runtime/adapters/mock/mock-image-registry.ts \
  apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts \
  apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts .claude/rules/api/runtime.md
git add apps/api/src/modules/runtime/image-registry.ts apps/api/src/modules/runtime/adapters/zot \
  apps/api/src/modules/runtime/adapters/mock/mock-image-registry.ts \
  apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts \
  apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts .claude/rules/api/runtime.md
git commit -m "feat: add the ImageRegistry port with Zot and mock adapters

Refs #78"
```

Expected before commit: lint and typecheck clean, all tests PASS.

### Task 8: Pull built images with Marsa's registry credentials

**Files:**

- Modify: `apps/api/src/app/release/use-cases/deploy-release/deploy-release.use-case.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-release/tests/deploy-release.use-case.unit.test.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/tests/update-app.use-case.unit.test.ts`

**Interfaces:**

- Consumes: `ImageRegistry.pullCredentialsFor(imageRef)` (Task 7).
- Produces: constructor orders
  `DeployReleaseUseCase(db, repository, appRuntime, cipher, imageRegistry, config)` and
  `UpdateAppUseCase(db, repository, credentialsCipher, appRuntime, imageRegistry, config)`.

- [ ] **Step 1: Write the failing test for deploy-release**

In `deploy-release.use-case.unit.test.ts`: import
`MockImageRegistry` from `#src/modules/runtime/adapters/mock/mock-image-registry.js`; in the
`build()` helper add

```ts
const imageRegistry = createStubInstance(MockImageRegistry)
imageRegistry.pullCredentialsFor.returns(undefined)
```

change the constructor call to
`new DeployReleaseUseCase(stubDatabase(), repository, appRuntime, cipher, imageRegistry, config)`,
and return `imageRegistry` from `build()`. Then add:

```ts
it('pulls an image from Marsa registry with its credentials, not the stored ones', async () => {
  const { usecase, appRuntime, cipher, imageRegistry } = build()
  const marsaCredentials = {
    registry: 'registry.demo.marsa.cc',
    username: 'marsa-pull',
    password: 'p',
  }
  imageRegistry.pullCredentialsFor.returns(marsaCredentials)

  await usecase.execute('my-app')

  expect(appRuntime.deploy.firstCall.args[1].credentials).toEqual(marsaCredentials)
  expect(cipher.openForApp.called).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — typecheck error on the 6-argument constructor (build fails), which is the red.

- [ ] **Step 3: Implement in deploy-release**

In `deploy-release.use-case.ts`, import `ImageRegistry` from
`#src/modules/runtime/image-registry.js`, add `private readonly imageRegistry: ImageRegistry,`
after `private readonly cipher: ImagePullCredentialsCipher,`, and replace the first line of
`deploy()` with:

```ts
const credentials =
  this.imageRegistry.pullCredentialsFor(release.imageRef) ??
  this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
```

- [ ] **Step 4: Same change in update-app, with its test**

In `update-app.use-case.unit.test.ts`, import `MockImageRegistry`, add to `build()`

```ts
const imageRegistry = createStubInstance(MockImageRegistry)
imageRegistry.pullCredentialsFor.returns(undefined)
```

change the constructor call to
`new UpdateAppUseCase(stubDatabase(), repository, cipher, appRuntime, imageRegistry, config)`, add
`imageRegistry` to the returned object, and add after `re-applies the live release when the pin
changes`:

```ts
it('re-applies a Marsa-registry image with Marsa credentials, not the stored ones', async () => {
  const { usecase, appRuntime, cipher, imageRegistry } = buildPinned()
  const marsaCredentials = {
    registry: 'registry.demo.marsa.cc',
    username: 'marsa-pull',
    password: 'p',
  }
  imageRegistry.pullCredentialsFor.returns(marsaCredentials)

  await usecase.execute('my-app', new UpdateAppCommandBuilder().withNodePin(PIN).build())

  expect(appRuntime.deploy.firstCall.args[1].credentials).toEqual(marsaCredentials)
  expect(cipher.openForApp.called).toBe(false)
})
```

In `update-app.use-case.ts`, import `ImageRegistry`, add
`private readonly imageRegistry: ImageRegistry,` after
`private readonly appRuntime: AppRuntime,`, and replace the `const credentials = …openForApp(…)`
statement with:

```ts
const credentials =
  this.imageRegistry.pullCredentialsFor(release.imageRef) ??
  this.credentialsCipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
```

- [ ] **Step 5: Run to verify everything passes**

Run: `pnpm --filter api lint && pnpm --filter api typecheck && pnpm --filter api test`
Expected: PASS, including the existing deploy-release / update-app e2e tests (the mock returns
`undefined`, so their behaviour is unchanged).

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/release/use-cases/deploy-release \
  apps/api/src/app/app-management/use-cases/update-app
git add apps/api/src/app/release/use-cases/deploy-release apps/api/src/app/app-management/use-cases/update-app
git commit -m "feat: pull images from Marsa registry with its read-only credentials

Refs #78"
```

### Task 9: Deleting an app deletes its registry repository

**Files:**

- Modify: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.use-case.unit.test.ts`
- Modify: `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.e2e.test.ts`

**Interfaces:**

- Consumes: `ImageRegistry.deleteRepository(appSlug)`, `MockImageRegistry.deletedRepositories`,
  `MockImageRegistry.failNextDelete` (Task 7).
- Produces: `DeleteAppUseCase(db, repository, appRuntime, imageRegistry)`.

- [ ] **Step 1: Write the failing unit tests**

In `delete-app.use-case.unit.test.ts`, import `MockImageRegistry`; in `build()` add

```ts
const imageRegistry = createStubInstance(MockImageRegistry)
imageRegistry.deleteRepository.resolves()
```

construct with `new DeleteAppUseCase(stubDatabase(), repository, appRuntime, imageRegistry)`,
return `imageRegistry`, and add:

```ts
it('deletes the app registry repository after removing it from the runtime', async () => {
  const { appRuntime, imageRegistry, usecase } = build()

  await usecase.execute('my-app')

  expect(imageRegistry.deleteRepository.calledOnceWithExactly('my-app')).toBe(true)
  expect(
    appRuntime.destroy.getCall(0).calledBefore(imageRegistry.deleteRepository.getCall(0)),
  ).toBe(true)
})

it('maps a registry failure to 502 so the rows roll back and the delete can be retried', async () => {
  const { imageRegistry, usecase } = build()
  imageRegistry.deleteRepository.rejects(new Error('registry down'))

  await expect(usecase.execute('my-app')).rejects.toThrow(BadGatewayException)
})
```

- [ ] **Step 2: Write the failing e2e tests**

In `delete-app.e2e.test.ts`, import `ImageRegistry` from `#src/modules/runtime/image-registry.js`
and the `MockImageRegistry` type, then add to the `removes the app and its releases` test, after
the 204:

```ts
const imageRegistry = setup.testModule.get<ImageRegistry, MockImageRegistry>(ImageRegistry)
expect(imageRegistry.deletedRepositories).toContain(SLUG)
```

and a new case:

```ts
it('keeps the app when its registry repository cannot be deleted', async () => {
  const slug = 'delete-e2e-registry-down'
  const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build()
  await setup.db.insert(appTable).values(app)
  setup.testModule
    .get<ImageRegistry, MockImageRegistry>(ImageRegistry)
    .failNextDelete(new Error('registry down'))

  await request(setup.httpServer)
    .delete(`/api/v1/apps/${slug}`)
    .set('Cookie', sessionCookie)
    .expect(502)

  const apps = await setup.db.select().from(appTable).where(eq(appTable.slug, slug))
  expect(apps).toHaveLength(1)
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter api test`
Expected: FAIL (constructor arity in the unit test; `deletedRepositories` empty in the e2e).

- [ ] **Step 4: Implement**

In `delete-app.use-case.ts`, import `ImageRegistry`, add
`private readonly imageRegistry: ImageRegistry,` after `appRuntime`, add
`await this.deleteImages(placement.app.slug)` after `await this.destroy(placement)`, and add:

```ts
  private async deleteImages(slug: string): Promise<void> {
    try {
      await this.imageRegistry.deleteRepository(slug)
    } catch (error) {
      throw new BadGatewayException(
        `Could not remove the images of '${slug}' from the registry. Please try again.`,
        { cause: error },
      )
    }
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter api lint && pnpm --filter api typecheck && pnpm --filter api test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/app-management/use-cases/delete-app
git add apps/api/src/app/app-management/use-cases/delete-app
git commit -m "feat: delete an app's registry repository with the app

Refs #78"
```

### Task 10: Installer and cluster e2e

**Files:**

- Modify: `scripts/install.sh`
- Modify: `scripts/e2e-up.sh`
- Modify: `scripts/e2e-test.sh`

**Interfaces:**

- Consumes: Secret `marsa-registry-secrets` (`PUSH_PASSWORD`, `PULL_PASSWORD`), Service
  `marsa-registry:5000`, host `registry.<domain>` (Part A, published chart).

- [ ] **Step 1: `install.sh` trusts the registry on `--no-tls` installs**

Add after `install_k3s_agent()`:

```bash
write_registry_trust() {
  # A --no-tls install serves Traefik's self-signed default cert, which containerd refuses on pull.
  [ "$TLS_ENABLED" = "false" ] || return 0
  mkdir -p /etc/rancher/k3s
  cat > /etc/rancher/k3s/registries.yaml <<EOF
configs:
  "registry.${DOMAIN}":
    tls:
      insecure_skip_verify: true
EOF
  ok "Nodes will trust registry.${DOMAIN} without a public certificate (--no-tls)"
}
```

In `main()`, in the non-`SKIP_K3S` branch, call `write_registry_trust` immediately before
`install_k3s`. In `usage()`, extend the `--no-tls` line to: `Disable HTTPS. Not recommended; nodes
also skip TLS verification for registry.<domain>.`

- [ ] **Step 2: `e2e-up.sh` gives k3d the same trust**

Replace the `k3d cluster create …` line with:

```bash
registries="$(mktemp)"
trap 'rm -f "$registries"' EXIT
cat > "$registries" <<EOF
configs:
  "registry.${BASE_DOMAIN}":
    tls:
      insecure_skip_verify: true
EOF
k3d cluster create "$CLUSTER" -p "${HTTP_PORT}:80@loadbalancer" -p "${HTTPS_PORT}:443@loadbalancer" \
  --registry-config "$registries" --wait
```

(If Task 1's spike failed and a fallback was agreed, apply that fallback here instead.)

- [ ] **Step 3: `e2e-test.sh` asserts push, read-only pull user, and node pull**

Insert after the `== stage: rollout ==` block:

```bash
echo "== stage: registry =="
kubectl -n "$NS" rollout status statefulset/marsa-registry --timeout=180s \
  || fail registry "marsa-registry did not roll out"
secret_value() {
  kubectl -n "$NS" get secret marsa-registry-secrets -o "jsonpath={.data.$1}" | base64 -d
}
push_pw="$(secret_value PUSH_PASSWORD)"
pull_pw="$(secret_value PULL_PASSWORD)"
registry_image="registry.${BASE_DOMAIN}/e2e-registry:1"

crane_pod() {
  local name="$1" user="$2" password="$3"
  kubectl -n "$NS" delete pod "$name" --ignore-not-found >/dev/null
  kubectl -n "$NS" run "$name" --restart=Never --image=gcr.io/go-containerregistry/crane:debug \
    --env="U=${user}" --env="P=${password}" --command -- sh -c \
    'crane auth login marsa-registry:5000 -u "$U" -p "$P" && crane copy --insecure nginx:1.27 marsa-registry:5000/e2e-registry:1'
}

crane_pod registry-push marsa-push "$push_pw"
kubectl -n "$NS" wait --for=jsonpath='{.status.phase}'=Succeeded pod/registry-push --timeout=180s \
  || fail registry "push as marsa-push failed: $(kubectl -n "$NS" logs registry-push 2>&1 | tail -5)"

crane_pod registry-push-denied marsa-pull "$pull_pw"
kubectl -n "$NS" wait --for=jsonpath='{.status.phase}'=Failed pod/registry-push-denied --timeout=180s \
  || fail registry "a push as marsa-pull was not rejected"
kubectl -n "$NS" logs registry-push-denied 2>&1 | grep -q DENIED \
  || fail registry "marsa-pull push failed for a reason other than DENIED"

kubectl -n "$NS" delete secret e2e-registry-pull --ignore-not-found >/dev/null
kubectl -n "$NS" create secret docker-registry e2e-registry-pull --docker-server="registry.${BASE_DOMAIN}" \
  --docker-username=marsa-pull --docker-password="$pull_pw" >/dev/null
kubectl -n "$NS" delete pod registry-pull --ignore-not-found >/dev/null
kubectl -n "$NS" run registry-pull --image="$registry_image" \
  --overrides='{"spec":{"imagePullSecrets":[{"name":"e2e-registry-pull"}]}}' >/dev/null
kubectl -n "$NS" wait --for=condition=Ready pod/registry-pull --timeout=180s \
  || fail registry "a node could not pull ${registry_image}: $(kubectl -n "$NS" describe pod registry-pull | tail -15)"
kubectl -n "$NS" delete pod registry-push registry-push-denied registry-pull --ignore-not-found >/dev/null
kubectl -n "$NS" delete secret e2e-registry-pull --ignore-not-found >/dev/null
echo "  pushed in-cluster as marsa-push, marsa-pull refused, node pulled ${registry_image}"
```

- [ ] **Step 4: Lint the scripts and run the e2e locally (needs the published chart)**

```bash
shellcheck scripts/install.sh scripts/e2e-up.sh scripts/e2e-test.sh
pnpm e2e:down || true
MARSA_E2E_HTTP_PORT=8080 MARSA_E2E_HTTPS_PORT=8443 pnpm e2e:up
MARSA_E2E_HTTPS_PORT=8443 pnpm e2e:test
pnpm e2e:down
```

Expected: shellcheck clean; `E2E PASS`. `pnpm e2e:up` installs the latest published api image,
which predates Task 6, so the api may run without the registry env; the registry stage only needs
the chart. If the chart release (Task 5) has not been tagged yet, the registry stage fails with
"marsa-registry did not roll out": finish Part A first.

- [ ] **Step 5: Commit**

```bash
git add scripts/install.sh scripts/e2e-up.sh scripts/e2e-test.sh
git commit -m "feat: trust the registry on TLS-less clusters and assert it in e2e

Refs #78"
```

### Task 11: AgDR, full verification, PR

**Files:**

- Create: `docs/agdr/AgDR-<next>-self-hosted-registry-zot.md` (`<next>` = one above the highest
  number in `docs/agdr/` at the time, checked against `main` for Phase B collisions)

- [ ] **Step 1: Write the AgDR**

Front matter like `AgDR-0047` (`id`, `timestamp`, `agent: claude`, `model`, `trigger: user-prompt`,
`status: accepted`, `ticket: marsa-cloud/marsa#78`). Body per `templates/agdr.md`:

- One-line summary: in the context of storing built images in the cluster (#78), facing unbounded
  disk growth and credentials copied into every environment namespace, decided on Zot (minimal
  image) with retention and a read-only pull user, pushed to over the in-cluster Service and pulled
  through `registry.<domain>`, accepting one more StatefulSet (~25 MiB) and that rollbacks past
  `keepImages` builds fail at pull time.
- Options table: Distribution (no retention, offline GC, no permission levels), Zot full (51 MiB,
  ~13% CPU idle on extensions), **Zot minimal** (23 MiB, retention + access control verified),
  Harbor (2–4 GB, own Postgres/Redis). Include the "Already verified" results as evidence.
- Pull/push split and why (loopback in e2e, hairpin NAT on clouds).
- Consequences: `--no-tls` installs and k3d skip TLS verification for the registry host; the api
  holds `marsa-push` to delete repos; chart must ship before the api.
- Artifacts: spec path, this plan, both PRs.

- [ ] **Step 2: Full verification**

```bash
pnpm format:check
pnpm lint
pnpm --filter api typecheck && pnpm --filter web typecheck
pnpm --filter api test
pnpm --filter web test
git diff --stat origin/main...HEAD
```

Expected: all green; api coverage floors hold. `openapi.json` does not change (no endpoint
changes); if the drift check says otherwise, regenerate with `pnpm --filter api generate:openapi`
and commit it.

- [ ] **Step 3: Commit the AgDR and open the PR**

```bash
pnpm exec prettier --write docs/agdr/AgDR-*-self-hosted-registry-zot.md
git add docs/agdr/AgDR-*-self-hosted-registry-zot.md
git commit -m "docs: record the self-hosted registry decision

Refs #78"
git push -u origin feature/78-self-hosted-registry
gh pr create --repo marsa-cloud/marsa --base docs/21-phase-c-spec \
  --title "feat(#78): self-hosted registry port and e2e" --body-file <scratchpad>/marsa-pr-body.md
```

The body links the AgDR and the charts PR, says `Closes #78`, has narrative Summary bullets,
Testing (unit + e2e + `pnpm e2e:test` registry stage), and a Glossary. The base is the spec branch
because the PRs are stacked; retarget to `main` once the spec PR merges. Then `/code-review`,
Security Auditor review (credentials in env, a new public host), and stop at the merge gate.

---

## Self-review notes

- Spec §1 coverage: Zot StatefulSet/PVC/Service/ConfigMap (Task 3), IngressRoute host (Task 4),
  retention + two users (Tasks 2–3), generate-once Secret (Task 2), resources + `GOMEMLIMIT`
  (Task 3), config validation first step (done up front and re-run in Task 3), env vars (Tasks 4,
  6), `ImageRegistry.pullCredentialsFor` / `deleteRepository` + mock (Task 7), deploy paths
  (Task 8), `delete-app` (Task 9), installer `--no-tls` + k3d + e2e registry stage (Task 10), AgDR
  (Task 11).
- Deferred to PR 2 on purpose: the `marsa-builds` namespace, the push dockerconfigjson there,
  `imageRefFor` / `pushRefFor`.
