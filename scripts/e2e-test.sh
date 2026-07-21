#!/usr/bin/env bash
# Assertions only; runs against any installed Marsa (k3d locally, real K3s in CI).
set -euo pipefail

CLUSTER="${MARSA_E2E_CLUSTER:-marsa-e2e}"
BASE_DOMAIN="${MARSA_E2E_DOMAIN:-127.0.0.1.nip.io}"
NS="${MARSA_NAMESPACE:-marsa}"
APPS_NS="${MARSA_APPS_NAMESPACE:-marsa-apps}"
APP_SLUG="e2e-app"
APP_IMAGE="nginx:1.27"

# CI exports KUBECONFIG for the real-K3s install; locally, fall back to the
# kubeconfig k3d wrote for the e2e cluster.
if [ -z "${KUBECONFIG:-}" ] && k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  KUBECONFIG="$(k3d kubeconfig write "$CLUSTER")"
  export KUBECONFIG
fi

kubectl -n "$NS" rollout status deploy/marsa-api --timeout=180s
kubectl -n "$NS" rollout status deploy/marsa-web --timeout=180s

api_pod="$(kubectl -n "$NS" get pod -l app=marsa-api -o jsonpath='{.items[0].metadata.name}')"
cookie="$(kubectl -n "$NS" exec "$api_pod" -- node dist/src/entrypoints/seed-dev.js --user-only | grep -oE 'marsa_session=[^[:space:]]+')"

curl -k -sf -X POST "https://api.${BASE_DOMAIN}/api/v1/deployments/deploy" \
  -H 'Content-Type: application/json' \
  -H "Cookie: ${cookie}" \
  -d "{\"slug\":\"${APP_SLUG}\",\"image\":\"${APP_IMAGE}\",\"containerPort\":80}" >/dev/null

kubectl -n "$APPS_NS" get deploy "$APP_SLUG"
kubectl -n "$APPS_NS" get service "$APP_SLUG"
kubectl -n "$APPS_NS" get ingressroute "$APP_SLUG"

for _ in $(seq 1 30); do
  if curl -k -sf "https://${APP_SLUG}.${BASE_DOMAIN}/" >/dev/null; then
    echo "E2E PASS: ${APP_SLUG}.${BASE_DOMAIN} reachable over HTTPS"
    exit 0
  fi
  sleep 2
done

echo "E2E FAIL: ${APP_SLUG}.${BASE_DOMAIN} not reachable over HTTPS" >&2
exit 1
