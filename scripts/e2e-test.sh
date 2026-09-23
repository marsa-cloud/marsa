#!/usr/bin/env bash
# Assertions only; runs against any installed Marsa (k3d locally, real K3s in CI).
set -euo pipefail

CLUSTER="${MARSA_E2E_CLUSTER:-marsa-e2e}"
BASE_DOMAIN="${MARSA_E2E_DOMAIN:-127.0.0.1.nip.io}"
NS="${MARSA_NAMESPACE:-marsa}"
KEDA_NS="${MARSA_KEDA_NAMESPACE:-keda}"
TRAEFIK_NS="${MARSA_TRAEFIK_NAMESPACE:-kube-system}"
APP_SLUG="e2e-app"
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

echo "== stage: registry =="
kubectl -n "$NS" rollout status statefulset/marsa-registry --timeout=180s \
  || fail registry "marsa-registry did not roll out"
secret_value() {
  kubectl -n "$NS" get secret marsa-registry-secrets -o "jsonpath={.data.$1}" | base64 -d
}
push_pw="$(secret_value PUSH_PASSWORD)"
pull_pw="$(secret_value PULL_PASSWORD)"
registry_image="registry.${BASE_DOMAIN}/e2e-registry:1"

# Pushes from a pod to the in-cluster Service, the way build Jobs will.
crane_push() {
  local name="$1" user="$2" password="$3" tag="$4"
  kubectl -n "$NS" delete pod "$name" --ignore-not-found >/dev/null
  # shellcheck disable=SC2016 # $U, $P and $T expand inside the pod, not here
  kubectl -n "$NS" run "$name" --restart=Never --image=gcr.io/go-containerregistry/crane:debug \
    --env="U=${user}" --env="P=${password}" --env="T=${tag}" --command -- sh -c \
    'crane auth login marsa-registry:5000 -u "$U" -p "$P" && crane copy --insecure busybox:1.37 "marsa-registry:5000/e2e-registry:$T"' >/dev/null
}

crane_push registry-push marsa-push "$push_pw" 1
kubectl -n "$NS" wait --for=jsonpath='{.status.phase}'=Succeeded pod/registry-push --timeout=180s \
  || fail registry "push as marsa-push failed: $(kubectl -n "$NS" logs registry-push 2>&1 | tail -5)"

# A new tag: crane skips the write, and so never hits the access check, when the manifest exists.
crane_push registry-push-denied marsa-pull "$pull_pw" denied
kubectl -n "$NS" wait --for=jsonpath='{.status.phase}'=Failed pod/registry-push-denied --timeout=180s \
  || fail registry "a push as marsa-pull was not rejected"
kubectl -n "$NS" logs registry-push-denied 2>&1 | grep -q DENIED \
  || fail registry "marsa-pull push failed for a reason other than DENIED"

kubectl -n "$NS" delete secret e2e-registry-pull --ignore-not-found >/dev/null
kubectl -n "$NS" create secret docker-registry e2e-registry-pull --docker-server="registry.${BASE_DOMAIN}" \
  --docker-username=marsa-pull --docker-password="$pull_pw" >/dev/null
kubectl -n "$NS" delete pod registry-pull --ignore-not-found >/dev/null
kubectl -n "$NS" run registry-pull --image="$registry_image" \
  --overrides='{"spec":{"imagePullSecrets":[{"name":"e2e-registry-pull"}]}}' --command -- sleep 3600 >/dev/null
kubectl -n "$NS" wait --for=condition=Ready pod/registry-pull --timeout=180s \
  || fail registry "a node could not pull ${registry_image}: $(kubectl -n "$NS" describe pod registry-pull | tail -15)"
kubectl -n "$NS" delete pod registry-push registry-push-denied registry-pull --ignore-not-found >/dev/null
kubectl -n "$NS" delete secret e2e-registry-pull --ignore-not-found >/dev/null
echo "  pushed in-cluster as marsa-push, marsa-pull refused, node pulled ${registry_image}"

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
