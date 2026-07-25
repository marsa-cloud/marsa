#!/usr/bin/env bash
# Assertions only; runs against any installed Marsa (k3d locally, real K3s in CI).
set -euo pipefail

CLUSTER="${MARSA_E2E_CLUSTER:-marsa-e2e}"
BASE_DOMAIN="${MARSA_E2E_DOMAIN:-127.0.0.1.nip.io}"
NS="${MARSA_NAMESPACE:-marsa}"
APPS_NS="${MARSA_APPS_NAMESPACE:-marsa-apps}"
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
for attempt in $(seq 1 10); do
  api_pod="$(kubectl -n "$NS" get pod -l app=marsa-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -n "$api_pod" ]; then
    cookie="$(kubectl -n "$NS" exec "$api_pod" -- node dist/src/entrypoints/seed-dev.js --user-only 2>/dev/null | grep -oE 'marsa_session=[^[:space:]]+' || true)"
    [ -n "$cookie" ] && break
  fi
  echo "  attempt ${attempt}: session cookie not ready"
  sleep 3
done
[ -n "$cookie" ] || fail seed "seed-dev.js did not print a session cookie after retries"

echo "== stage: deploy app via API =="
deploy_status=""
for attempt in $(seq 1 20); do
  http -X POST "https://api.${BASE_DOMAIN}${PORT_SUFFIX}/api/v1/deploy" \
    -H 'Content-Type: application/json' \
    -H "Cookie: ${cookie}" \
    -d "{\"slug\":\"${APP_SLUG}\",\"image\":\"${APP_IMAGE}\",\"containerPort\":80}" || true
  deploy_status="$HTTP_STATUS"
  echo "  attempt ${attempt}: POST /deploy -> ${deploy_status}"
  case "$deploy_status" in
    2??) break ;;
  esac
  sleep 3
done
case "$deploy_status" in
  2??) : ;;
  *) fail deploy "POST /deploy -> ${deploy_status}; body: ${HTTP_BODY}" ;;
esac

echo "== stage: k8s resources created =="
kubectl -n "$APPS_NS" get deploy "$APP_SLUG" || fail resources "deployment ${APP_SLUG} missing in ${APPS_NS}"
kubectl -n "$APPS_NS" get service "$APP_SLUG" || fail resources "service ${APP_SLUG} missing in ${APPS_NS}"
kubectl -n "$APPS_NS" get ingressroutes.traefik.io "$APP_SLUG" || fail resources "ingressroute ${APP_SLUG} missing in ${APPS_NS}"

echo "== stage: app reachable over HTTPS =="
for _ in $(seq 1 30); do
  if http "https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/" && [ "$HTTP_STATUS" = 200 ]; then
    echo "E2E PASS: ${APP_SLUG}.${BASE_DOMAIN} reachable over HTTPS (200)"
    exit 0
  fi
  sleep 2
done
fail app-reachable "GET https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/ -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
