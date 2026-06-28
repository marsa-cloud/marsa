#!/usr/bin/env bash
#
# cd-deploy.sh — roll the running Marsa release to a given image tag.
#
# This is the target of a forced-command SSH key on the VPS: the CD pipeline
# SSHes in with the image tag as the command, OpenSSH ignores that command and
# runs this script with the tag available in $SSH_ORIGINAL_COMMAND. The key can
# therefore only ever trigger a Marsa image roll — never an arbitrary command.
#
# One-time setup (see docs/superpowers/specs/2026-06-28-continuous-deploy-design.md):
#   - install at /usr/local/bin/marsa-cd-deploy.sh (root, 0755)
#   - /root/.ssh/authorized_keys: command="/usr/local/bin/marsa-cd-deploy.sh",...
#   - sshd_config: PermitRootLogin forced-commands-only
#
# Local manual use: marsa-cd-deploy.sh sha-abc1234

set -euo pipefail

NAMESPACE="${MARSA_NAMESPACE:-marsa}"
RELEASE="${MARSA_RELEASE:-marsa}"
CHART_REF="${MARSA_CHART_REF:-oci://ghcr.io/marsa-cloud/charts/marsa}"

# The tag comes from the forced-command SSH invocation ($SSH_ORIGINAL_COMMAND);
# fall back to the first positional arg for local/manual runs.
tag="${SSH_ORIGINAL_COMMAND:-${1:-}}"

# Only ever accept an immutable image SHA tag (sha-<hex>). This is the guard that
# makes the forced-command key safe: anything else — including a shell command
# slipped into SSH_ORIGINAL_COMMAND — is refused. The regex is fully anchored so
# no trailing characters (e.g. `sha-a,foo=bar`) can leak into `helm --set`, where
# commas would be parsed as extra key=value pairs.
if [[ ! "$tag" =~ ^sha-[0-9a-f]+$ ]]; then
  echo "cd-deploy: refusing tag '$tag' (expected sha-<hex>)" >&2
  exit 1
fi

export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"

# Pin to the chart version that is already installed so an app deploy never pulls
# a different chart (keeps Track A image rolls separate from Track B chart
# releases). Read via -o yaml + awk to avoid a jq dependency on the VPS.
ver="$(helm get metadata "$RELEASE" -n "$NAMESPACE" -o yaml | awk '/^version:/{print $2}')"
[ -n "$ver" ] || { echo "cd-deploy: could not read installed chart version for release '$RELEASE'" >&2; exit 1; }

echo "cd-deploy: rolling $RELEASE to image.tag=$tag (chart $ver)"
helm upgrade --install "$RELEASE" "$CHART_REF" \
  --namespace "$NAMESPACE" \
  --version "$ver" \
  --reuse-values \
  --set "image.tag=$tag" \
  --wait --timeout 10m --rollback-on-failure

echo "cd-deploy: done"
