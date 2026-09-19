#!/usr/bin/env bash
# Assertions only; runs against any installed Marsa (k3d locally, real K3s in CI).
set -euo pipefail

CLUSTER="${MARSA_E2E_CLUSTER:-marsa-e2e}"
BASE_DOMAIN="${MARSA_E2E_DOMAIN:-127.0.0.1.nip.io}"
NS="${MARSA_NAMESPACE:-marsa}"
APPS_NS="${MARSA_APPS_NAMESPACE:-marsa-apps}"
KEDA_NS="${MARSA_KEDA_NAMESPACE:-keda}"
TRAEFIK_NS="${MARSA_TRAEFIK_NAMESPACE:-kube-system}"
APP_SLUG="e2e-app"
APP_IMAGE="nginx:1.27"

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

echo "== stage: deploy app via API =="
api="https://api.${BASE_DOMAIN}${PORT_SUFFIX}/api/v1"
create_status=""
for attempt in $(seq 1 20); do
  http -X POST "${api}/apps" \
    -H 'Content-Type: application/json' \
    -H "Cookie: ${cookie}" \
    -d "{\"slug\":\"${APP_SLUG}\",\"image\":\"${APP_IMAGE}\",\"containerPort\":80}" || true
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
for _ in $(seq 1 30); do
  if http "https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/" && [ "$HTTP_STATUS" = 200 ]; then
    echo "E2E PASS: ${APP_SLUG}.${BASE_DOMAIN} reachable over HTTPS (200)"
    exit 0
  fi
  sleep 2
done
fail app-reachable "GET https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/ -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
