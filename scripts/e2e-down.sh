#!/usr/bin/env bash
set -euo pipefail

k3d cluster delete "${1:-${MARSA_E2E_CLUSTER:-marsa-e2e}}"
