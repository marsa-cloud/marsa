#!/usr/bin/env bash
#
# cd-deploy.sh — roll the running Marsa release to a new image tag, or bump its
# Helm chart version.
#
# This is the target of a forced-command SSH key on the VPS: the CD pipeline
# SSHes in with the argument as the command, OpenSSH ignores that command and
# runs this script with the argument available in $SSH_ORIGINAL_COMMAND. The key
# can therefore only ever trigger a Marsa image roll or a chart bump of the
# `marsa` release — never an arbitrary command.
#
# Two modes, disambiguated by an explicit input prefix (both fully anchored, so
# nothing leaks into `helm --set` / `helm --version`):
#   - sha-<hex>       → image roll: chart-pinned `helm upgrade --reuse-values
#                       --set image.tag=<sha>` (see AgDR-0028)
#   - chart:<semver>  → chart bump: `helm upgrade --version <v>
#                       --reset-then-reuse-values`, keeping the running image +
#                       tls/domain (see AgDR-0028 amendment, #139)
#
# One-time setup (see AgDR-0028):
#   - install at /usr/local/bin/marsa-cd-deploy.sh (root, 0755)
#   - /root/.ssh/authorized_keys: command="/usr/local/bin/marsa-cd-deploy.sh",...
#   - sshd_config: PermitRootLogin forced-commands-only
#
# Local manual use: marsa-cd-deploy.sh sha-abc1234
#                   marsa-cd-deploy.sh chart:0.0.1-alpha.3

set -euo pipefail

NAMESPACE="${MARSA_NAMESPACE:-marsa}"
RELEASE="${MARSA_RELEASE:-marsa}"
CHART_REF="${MARSA_CHART_REF:-oci://ghcr.io/marsa-cloud/charts/marsa}"

# The argument comes from the forced-command SSH invocation ($SSH_ORIGINAL_COMMAND);
# fall back to the first positional arg for local/manual runs.
arg="${SSH_ORIGINAL_COMMAND:-${1:-}}"

# Dispatch on an explicit, fully-anchored prefix. Anchoring is the guard that
# makes the forced-command key safe: anything that isn't one of these two exact
# shapes — including a shell command slipped into SSH_ORIGINAL_COMMAND — is
# refused, so no trailing characters (e.g. `sha-a,foo=bar`) can leak into
# `helm --set` or `helm --version`.
if [[ "$arg" =~ ^sha-[0-9a-f]+$ ]]; then
  mode=image
elif [[ "$arg" =~ ^chart:[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
  mode=chart
  chart_ver="${arg#chart:}"
else
  echo "cd-deploy: refusing '$arg' (expected sha-<hex> or chart:<semver>)" >&2
  exit 1
fi

export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"

if [[ "$mode" == image ]]; then
  # Image roll. Pin to the chart version that is already installed so an app
  # deploy never pulls a different chart. Read via -o yaml + awk to avoid a jq
  # dependency on the VPS.
  ver="$(helm get metadata "$RELEASE" -n "$NAMESPACE" -o yaml | awk '/^version:/{print $2}')"
  [ -n "$ver" ] || { echo "cd-deploy: could not read installed chart version for release '$RELEASE'" >&2; exit 1; }

  echo "cd-deploy: rolling $RELEASE to image.tag=$arg (chart $ver, pinned)"
  helm upgrade --install "$RELEASE" "$CHART_REF" \
    --namespace "$NAMESPACE" \
    --version "$ver" \
    --reuse-values \
    --set "image.tag=$arg" \
    --wait --timeout 10m --rollback-on-failure
else
  # Chart bump. Move to the requested chart version, keeping the running image
  # tag + tls/domain/email. --reset-then-reuse-values (Helm 3.14+) resets to the
  # NEW chart's defaults then re-overlays the prior release's values, so a value
  # newly introduced by the new chart gets its default instead of being silently
  # dropped — which is what plain --reuse-values would do across chart versions.
  echo "cd-deploy: bumping $RELEASE chart to $chart_ver (keeping current image)"
  helm upgrade --install "$RELEASE" "$CHART_REF" \
    --namespace "$NAMESPACE" \
    --version "$chart_ver" \
    --reset-then-reuse-values \
    --wait --timeout 10m --rollback-on-failure
fi

echo "cd-deploy: done"
