#!/usr/bin/env bash
# Provision only; assertions live in e2e-test.sh so CI can reuse them after its
# own real-K3s install.
set -euo pipefail

CLUSTER="${MARSA_E2E_CLUSTER:-marsa-e2e}"
BASE_DOMAIN="${MARSA_E2E_DOMAIN:-127.0.0.1.nip.io}"
IMAGE_TAG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --image-tag) IMAGE_TAG="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

here="$(cd "$(dirname "$0")" && pwd)"

k3d cluster create "$CLUSTER" -p "80:80@loadbalancer" -p "443:443@loadbalancer" --wait
KUBECONFIG="$(k3d kubeconfig write "$CLUSTER")"
export KUBECONFIG

MARSA_IMAGE_TAG="$IMAGE_TAG" bash "$here/install.sh" --domain "$BASE_DOMAIN" --skip-k3s --no-tls

echo "Marsa installed on k3d cluster '${CLUSTER}' (KUBECONFIG=${KUBECONFIG})"
echo "Run the assertions with: pnpm e2e:test"
