#!/usr/bin/env bash
# Assertions only; runs against any installed Marsa (k3d locally, real K3s in CI).
set -euo pipefail

CLUSTER="${MARSA_E2E_CLUSTER:-marsa-e2e}"
BASE_DOMAIN="${MARSA_E2E_DOMAIN:-127.0.0.1.nip.io}"
NS="${MARSA_NAMESPACE:-marsa}"
KEDA_NS="${MARSA_KEDA_NAMESPACE:-keda}"
TRAEFIK_NS="${MARSA_TRAEFIK_NAMESPACE:-kube-system}"
APP_SLUG="e2e-app"
DB_SLUG="e2e-db"
DB_NAME="e2e_db"
APP_IMAGE="nginx:1.27"
PROJECT_SLUG="e2e"
ENV_SLUG="dev"
APPS_NS="${PROJECT_SLUG}-${ENV_SLUG}"

# Defaults to 443 (CI's real-K3s path). Locally set to the k3d host port when
# :443 is taken; the suffix is appended to every HTTPS URL.
HTTPS_PORT="${MARSA_E2E_HTTPS_PORT:-443}"
if [ "$HTTPS_PORT" = 443 ]; then PORT_SUFFIX=""; else PORT_SUFFIX=":${HTTPS_PORT}"; fi

if [ -z "${KUBECONFIG:-}" ] && k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  KUBECONFIG="$(k3d kubeconfig write "$CLUSTER")"
  export KUBECONFIG
fi

fail() {
  echo "E2E FAIL [$1]: $2" >&2
  exit 1
}

# Runs curl, capturing status + body into HTTP_STATUS / HTTP_BODY rather than
# letting -f abort with an opaque exit 22. Returns curl's transport rc.
HTTP_STATUS=""
HTTP_BODY=""
http() {
  local bodyfile rc
  bodyfile="$(mktemp)"
  HTTP_STATUS="$(curl -k -sS -o "$bodyfile" -w '%{http_code}' "$@")" && rc=0 || rc=$?
  HTTP_BODY="$(cat "$bodyfile")"
  rm -f "$bodyfile"
  return "$rc"
}

echo "== stage: rollout =="
kubectl -n "$NS" rollout status deploy/marsa-api --timeout=180s || fail rollout "marsa-api did not roll out"
kubectl -n "$NS" rollout status deploy/marsa-web --timeout=180s || fail rollout "marsa-web did not roll out"

echo "== stage: seed session cookie =="
# Retried: right after rollout, `kubectl exec` into the api pod can hit a
# transient containerd "failed to load task: context deadline exceeded".
cookie=""
seed_rc=0
seed_out="$(mktemp)"
trap 'rm -f "$seed_out"' EXIT
for attempt in $(seq 1 10); do
  api_pod="$(kubectl -n "$NS" get pod -l app=marsa-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -n "$api_pod" ]; then
    seed_rc=0
    kubectl -n "$NS" exec "$api_pod" -- node dist/src/entrypoints/seed-dev.js --user-only >"$seed_out" 2>&1 || seed_rc=$?
    cookie="$(grep -oE 'marsa_session=[^[:space:]]+' "$seed_out" || true)"
    [ -n "$cookie" ] && break
  fi
  echo "  attempt ${attempt}: session cookie not ready"
  sleep 3
done
if [ -z "$cookie" ]; then
  echo "--- last seed-dev output ---" >&2
  cat "$seed_out" >&2
  echo "--- marsa-api pod state ---" >&2
  kubectl -n "$NS" get pod -l app=marsa-api -o wide >&2 2>/dev/null || true
  kubectl -n "$NS" logs -l app=marsa-api --tail=50 --all-containers >&2 2>/dev/null || true
  fail seed "seed-dev.js did not print a session cookie after retries"
fi
# seed-dev prints the cookie as the last statement of its `try`, then closes the
# Nest context in a `finally`. So a cookie plus a non-zero exit means the seed
# itself succeeded and only teardown failed — the cookie is still valid. Warn
# rather than fail, which would reintroduce the flakiness #173 set out to remove.
if [ "$seed_rc" -ne 0 ]; then
  echo "  warning: seed-dev exited ${seed_rc} after printing the cookie" >&2
  cat "$seed_out" >&2
fi

echo "== stage: create project + environment =="
api="https://api.${BASE_DOMAIN}${PORT_SUFFIX}/api/v1"
for attempt in $(seq 1 20); do
  http -X POST "${api}/projects" -H 'Content-Type: application/json' -H "Cookie: ${cookie}" \
    -d "{\"name\":\"E2E\",\"slug\":\"${PROJECT_SLUG}\"}" || true
  echo "  attempt ${attempt}: POST /projects -> ${HTTP_STATUS}"
  case "$HTTP_STATUS" in 2??|409) break ;; esac
  sleep 3
done
case "$HTTP_STATUS" in 2??|409) : ;; *) fail project "POST /projects -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;; esac

http -X POST "${api}/projects/${PROJECT_SLUG}/environments" -H 'Content-Type: application/json' \
  -H "Cookie: ${cookie}" -d "{\"name\":\"Dev\",\"slug\":\"${ENV_SLUG}\"}" || true
case "$HTTP_STATUS" in 2??|409) : ;; *) fail environment "POST environments -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;; esac

http "${api}/projects/${PROJECT_SLUG}/environments" -H "Cookie: ${cookie}" || true
env_uuid="$(printf '%s' "$HTTP_BODY" | grep -oE '"uuid":"[0-9a-f-]{36}"' | head -1 | cut -d'"' -f4)"
[ -n "$env_uuid" ] || fail environment "no environment uuid in: ${HTTP_BODY}"

echo "== stage: environment namespace provisioned =="
kubectl get ns "$APPS_NS" -o jsonpath='{.metadata.labels.marsa\.cloud/managed-by}' | grep -qx marsa-api \
  || fail namespace "namespace ${APPS_NS} missing or not labelled managed-by=marsa-api"
kubectl -n "$APPS_NS" get rolebinding marsa-deployer >/dev/null \
  || fail namespace "RoleBinding marsa-deployer missing in ${APPS_NS}"

echo "== stage: admission fence holds =="
# Server-side dry run runs admission. Target the release namespace: kube-public is refused by
# Kubernetes itself, which would pass without the policy.
fence_out="$(kubectl --as="system:serviceaccount:${NS}:marsa-api" delete ns "$NS" --dry-run=server 2>&1 || true)"
printf '%s' "$fence_out" | grep -q 'marsa-api-namespace-fence' \
  || fail fence "deleting ${NS} as marsa-api was not refused by the fence: ${fence_out}"

echo "== stage: deploy app via API =="
create_status=""
for attempt in $(seq 1 20); do
  http -X POST "${api}/apps" \
    -H 'Content-Type: application/json' \
    -H "Cookie: ${cookie}" \
    -d "{\"slug\":\"${APP_SLUG}\",\"image\":\"${APP_IMAGE}\",\"containerPort\":80,\"environmentUuid\":\"${env_uuid}\"}" || true
  create_status="$HTTP_STATUS"
  echo "  attempt ${attempt}: POST /apps -> ${create_status}"
  case "$create_status" in
    2??|409) break ;;
  esac
  sleep 3
done
case "$create_status" in
  2??|409) : ;;
  *) fail deploy "POST /apps -> ${create_status}; body: ${HTTP_BODY}" ;;
esac

http -X POST "${api}/apps/${APP_SLUG}/releases" \
  -H 'Content-Type: application/json' -H "Cookie: ${cookie}" -d '{}' || true
case "$HTTP_STATUS" in
  2??) : ;;
  *) fail deploy "POST /apps/${APP_SLUG}/releases -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;;
esac
http -X POST "${api}/apps/${APP_SLUG}/deploy" -H "Cookie: ${cookie}" || true
case "$HTTP_STATUS" in
  2??) : ;;
  *) fail deploy "POST /apps/${APP_SLUG}/deploy -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;;
esac
echo "== stage: k8s resources created =="
kubectl -n "$APPS_NS" get deploy "$APP_SLUG" || fail resources "deployment ${APP_SLUG} missing in ${APPS_NS}"
kubectl -n "$APPS_NS" get service "$APP_SLUG" || fail resources "service ${APP_SLUG} missing in ${APPS_NS}"
kubectl -n "$APPS_NS" get ingressroutes.traefik.io "$APP_SLUG" || fail resources "ingressroute ${APP_SLUG} missing in ${APPS_NS}"
kubectl -n "$APPS_NS" get httpscaledobjects.http.keda.sh "$APP_SLUG" || fail resources "httpscaledobject ${APP_SLUG} missing in ${APPS_NS}"

echo "== stage: node pinning =="
# The cluster is the source of truth for node names, so take the expected one from
# kubectl and assert the API reports the same node rather than trusting either alone.
node_name="$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')"
[ -n "$node_name" ] || fail node-pin "kubectl reported no nodes"
# The pin matches the hostname LABEL, which k8s does not guarantee equals the object name.
node_hostname="$(kubectl get node "$node_name" -o jsonpath='{.metadata.labels.kubernetes\.io/hostname}')"
[ -n "$node_hostname" ] || fail node-pin "node ${node_name} carries no kubernetes.io/hostname label"

http "${api}/nodes" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 200 ] || fail node-pin "GET /nodes -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
printf '%s' "$HTTP_BODY" | grep -q "\"name\":\"${node_name}\"" \
  || fail node-pin "GET /nodes omitted ${node_name}; body: ${HTTP_BODY}"
echo "  GET /nodes lists ${node_name}"

# A pin is not part of a Release, so PATCH alone must reach the cluster — no new
# release, no deploy call. That is the whole apply-immediately contract.
http -X PATCH "${api}/apps/${APP_SLUG}" -H 'Content-Type: application/json' -H "Cookie: ${cookie}" \
  -d "{\"nodePin\":{\"key\":\"kubernetes.io/hostname\",\"values\":[\"${node_hostname}\"],\"strategy\":\"required\"}}" || true
[ "$HTTP_STATUS" = 200 ] || fail node-pin "PATCH nodePin -> ${HTTP_STATUS}; body: ${HTTP_BODY}"

affinity_path='{.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0]}'
pinned=""
for _ in $(seq 1 30); do
  if kubectl -n "$APPS_NS" get deploy "$APP_SLUG" -o jsonpath="$affinity_path" 2>/dev/null \
    | grep -q "\"${node_hostname}\""; then
    pinned=1
    break
  fi
  sleep 2
done
[ -n "$pinned" ] || fail node-pin "deployment ${APP_SLUG} never gained a nodeAffinity for ${node_hostname}"
kubectl -n "$APPS_NS" rollout status "deploy/${APP_SLUG}" --timeout=120s \
  || fail node-pin "pinned ${APP_SLUG} did not roll out onto ${node_name}"
echo "  ${APP_SLUG} pinned to ${node_hostname} and rolled out"

# Clearing must strip the block entirely: an empty affinity object would churn the
# server-side-apply field manager on every later deploy.
http -X PATCH "${api}/apps/${APP_SLUG}" -H 'Content-Type: application/json' -H "Cookie: ${cookie}" \
  -d '{"nodePin":null}' || true
[ "$HTTP_STATUS" = 200 ] || fail node-pin "PATCH nodePin:null -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
cleared=""
for _ in $(seq 1 30); do
  if [ -z "$(kubectl -n "$APPS_NS" get deploy "$APP_SLUG" -o jsonpath='{.spec.template.spec.affinity}' 2>/dev/null)" ]; then
    cleared=1
    break
  fi
  sleep 2
done
[ -n "$cleared" ] || fail node-pin "affinity survived a cleared pin on ${APP_SLUG}"
echo "  cleared pin removed the affinity block"

# The reachability stage below cannot distinguish "app broken" from "scaling
# never wired up" — both are a timeout on the same URL. Assert the three pieces
# the request path depends on first, so a failure names the piece that is missing.
echo "== stage: KEDA owns scaling and Traefik can reach the interceptor =="
kubectl -n "$KEDA_NS" rollout status deploy/keda-add-ons-http-interceptor --timeout=180s \
  || fail scaling "KEDA HTTP interceptor is not ready in ${KEDA_NS}"

kubectl -n "$TRAEFIK_NS" get deploy traefik \
  -o jsonpath='{.spec.template.spec.containers[*].args}' 2>/dev/null \
  | grep -q 'allowCrossNamespace=true' \
  || fail scaling "Traefik lacks --providers.kubernetescrd.allowCrossNamespace=true; every app will 404"

# KEDA translates the HTTPScaledObject into a ScaledObject and then an HPA. The
# HPA existing is the evidence that KEDA -- not marsa-deployer -- owns replicas.
for _ in $(seq 1 30); do
  if kubectl -n "$APPS_NS" get hpa -o name 2>/dev/null | grep -q "$APP_SLUG"; then
    break
  fi
  sleep 2
done
kubectl -n "$APPS_NS" get hpa -o name 2>/dev/null | grep -q "$APP_SLUG" \
  || fail scaling "no HPA for ${APP_SLUG} — KEDA never took ownership of spec.replicas"

echo "== stage: app reachable over HTTPS =="
reachable=""
for _ in $(seq 1 30); do
  if http "https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/" && [ "$HTTP_STATUS" = 200 ]; then
    reachable=1
    break
  fi
  sleep 2
done
[ -n "$reachable" ] || fail app-reachable "GET https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/ -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
echo "  ${APP_SLUG}.${BASE_DOMAIN} reachable over HTTPS (200)"

echo "== stage: create a database via API =="
http -X POST "${api}/databases" -H 'Content-Type: application/json' -H "Cookie: ${cookie}" \
  -d "{\"environmentUuid\":\"${env_uuid}\",\"slug\":\"${DB_SLUG}\",\"engine\":\"postgres\",\"version\":\"17\",\"storageGib\":1}" || true
case "$HTTP_STATUS" in 2??) : ;; *) fail database "POST /databases -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;; esac

echo "== stage: database StatefulSet, Service, Secret and PVC exist =="
kubectl -n "$APPS_NS" rollout status "statefulset/${DB_SLUG}" --timeout=180s \
  || fail database "statefulset ${DB_SLUG} did not become ready"
kubectl -n "$APPS_NS" get "service/${DB_SLUG}" >/dev/null || fail database "service ${DB_SLUG} missing"
kubectl -n "$APPS_NS" get "secret/${DB_SLUG}-credentials" >/dev/null || fail database "credentials secret missing"
kubectl -n "$APPS_NS" get "pvc/data-${DB_SLUG}-0" >/dev/null || fail database "pvc data-${DB_SLUG}-0 missing"

echo "== stage: a database gets no HTTP routing =="
ingress_route="$(kubectl -n "$APPS_NS" get ingressroutes.traefik.io "$DB_SLUG" --ignore-not-found -o name)" \
  || fail database "could not query IngressRoutes"
[ -z "$ingress_route" ] || fail database "a database must not get an IngressRoute"
scaled_object="$(kubectl -n "$APPS_NS" get httpscaledobjects.http.keda.sh "$DB_SLUG" --ignore-not-found -o name)" \
  || fail database "could not query HTTPScaledObjects"
[ -z "$scaled_object" ] || fail database "a database must not get an HTTPScaledObject"

echo "== stage: data survives a pod restart =="
kubectl -n "$APPS_NS" exec "${DB_SLUG}-0" -- \
  psql -U postgres -d "$DB_NAME" -c 'create table survivors(id int); insert into survivors values (1);' \
  >/dev/null || fail database "seed insert failed"
kubectl -n "$APPS_NS" delete pod "${DB_SLUG}-0" >/dev/null
kubectl -n "$APPS_NS" rollout status "statefulset/${DB_SLUG}" --timeout=180s \
  || fail database "statefulset ${DB_SLUG} did not recover"
rows="$(kubectl -n "$APPS_NS" exec "${DB_SLUG}-0" -- \
  psql -U postgres -d "$DB_NAME" -tAc 'select count(*) from survivors' | tr -d '[:space:]')"
[ "$rows" = 1 ] || fail database "expected the row to survive the restart, got '${rows}'"

echo "== stage: deleting the database removes its resources =="
http -X DELETE "${api}/databases/${DB_SLUG}" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail database "DELETE /databases/${DB_SLUG} -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
for _ in $(seq 1 30); do
  kubectl -n "$APPS_NS" get "pvc/data-${DB_SLUG}-0" >/dev/null 2>&1 || break
  sleep 2
done
kubectl -n "$APPS_NS" get "pvc/data-${DB_SLUG}-0" >/dev/null 2>&1 \
  && fail database "pvc data-${DB_SLUG}-0 outlived the database"
kubectl -n "$APPS_NS" get "statefulset/${DB_SLUG}" >/dev/null 2>&1 \
  && fail database "statefulset ${DB_SLUG} outlived the database"

echo "== stage: environment delete is blocked while it has an app =="
env_url="${api}/projects/${PROJECT_SLUG}/environments/${ENV_SLUG}"
http -X DELETE "$env_url" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 409 ] || fail env-delete "expected 409 deleting a non-empty environment, got ${HTTP_STATUS}"

echo "== stage: teardown =="
http -X DELETE "${api}/apps/${APP_SLUG}" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail teardown "DELETE /apps/${APP_SLUG} -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
http -X DELETE "$env_url" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail teardown "DELETE environment -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
kubectl wait --for=delete "ns/${APPS_NS}" --timeout=120s || fail teardown "namespace ${APPS_NS} was not deleted"
http -X DELETE "${api}/projects/${PROJECT_SLUG}" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail teardown "DELETE /projects/${PROJECT_SLUG} -> ${HTTP_STATUS}"

echo "E2E PASS"
