#!/usr/bin/env bash
#
# install.sh — install (or update) Marsa on a Debian/Ubuntu VPS.
#
# What it does, in order:
#   1. Pre-flight checks (root, Debian/Ubuntu, required tools)
#   2. Installs K3s if absent (brings its own Traefik ingress + local-path storage)
#   3. Installs Helm 4.x if absent; errors out (never upgrades) if an older
#      Helm is present. The `--rollback-on-failure` flag we deploy with is
#      Helm 4-only.
#   4. helm upgrade --install of the Marsa chart from the OCI registry
#
# Re-running the script with the same arguments updates an existing install
# (steps 2 and 3 are skipped when already present; step 4 is an idempotent
# `helm upgrade --install`).
#
# Usage:
#   sudo ./scripts/install.sh --domain marsa.example.com [--email you@example.com] [options]
#
# See --help for the full flag list.

set -euo pipefail

# --- Defaults -----------------------------------------------------------------

CHART_REF="${MARSA_CHART_REF:-oci://ghcr.io/marsa-cloud/charts/marsa}"
RELEASE_NAME="${MARSA_RELEASE_NAME:-marsa}"
NAMESPACE="marsa"
MODE="server"             # "server" (default install) or "agent" (join an existing cluster)
DOMAIN=""
EMAIL=""
SERVER_URL=""             # agent mode: K3s server URL, e.g. https://10.0.0.5:6443
TOKEN="${MARSA_K3S_TOKEN:-}"  # agent mode: cluster node-token (env avoids it landing in shell history / ps)
CHART_VERSION=""        # empty → Helm pulls the latest published version (incl. pre-releases)
IMAGE_TAG="${MARSA_IMAGE_TAG:-}"  # empty → chart default image tag; overridable to pin a build
MIN_HELM_MAJOR=4        # 4+: --rollback-on-failure (a Helm 4 flag; Helm 3's equivalent is --atomic)
K3S_KUBECONFIG="/etc/rancher/k3s/k3s.yaml"
SKIP_K3S="false"          # --skip-k3s: install into an existing cluster (honor $KUBECONFIG)
# Helm's official get-helm-4 installer, pinned to a release tag rather than the
# moving `main` branch (supply-chain hygiene — see AgDR-0003). Overridable for
# testing. get-helm-4 exists from v4.1.0 onward; the pin cannot go below that.
# The pinned script still installs the latest stable Helm by default;
# set MARSA_HELM_VERSION to pin the Helm version itself.
HELM_INSTALL_SCRIPT_TAG="${MARSA_HELM_INSTALL_SCRIPT_TAG:-v4.1.3}"
HELM_VERSION="${MARSA_HELM_VERSION:-}"

# --- Output helpers -----------------------------------------------------------

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'
else
  C_RESET=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BOLD=""
fi

info()  { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()    { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()   { printf '%s✗ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }

usage() {
  cat <<EOF
${C_BOLD}Marsa installer${C_RESET}

Sets up everything Marsa needs on a fresh Debian/Ubuntu server and deploys
Marsa, served over HTTPS via Let's Encrypt.

${C_BOLD}Usage${C_RESET}
  Server (default):  sudo ./scripts/install.sh --domain <domain> [--email <email>] [options]
  Agent  (join):     sudo ./scripts/install.sh --agent --server-url <url> --token <token>

${C_BOLD}Required (server mode)${C_RESET}
  --domain <domain>     Domain Marsa is served on (also drives HTTPS).
                        The web UI is served on <domain>, the API on api.<domain>.

${C_BOLD}Options (server mode)${C_RESET}
  --email <email>       Email for Let's Encrypt registration.
                        Defaults to admin@<domain> if omitted.
  --chart-version <v>   Pin a specific Marsa version.
                        Default: latest published, including pre-releases.
  --namespace <ns>      Namespace to install into. Default: ${NAMESPACE}.
  --release <name>      Install/release name. Default: ${RELEASE_NAME}.
  --no-tls              Disable HTTPS. Not recommended.
  -h, --help            Show this help and exit.

${C_BOLD}Agent mode${C_RESET} — join this machine to an existing cluster as a worker node
  --agent               Join an existing Marsa cluster instead of installing one.
  --server-url <url>    K3s server URL, e.g. https://10.0.0.5:6443   (required with --agent)
  --token <token>       Cluster node-token from the server            (required with --agent)

  The server's install summary prints a ready-to-paste join command (token filled in).
  In --agent mode the server-only flags (--domain / --email / --no-tls / --chart-version)
  are not valid. Connect nodes over a private network — inter-node traffic is not
  encrypted by default (see marsa-cloud/marsa#24).

${C_BOLD}Environment overrides${C_RESET}
  MARSA_CHART_REF       Marsa chart reference. Default: ${CHART_REF}
  MARSA_IMAGE_TAG       Pin the marsa-api/web image tag (chart image.tag). Default: chart's own.
  MARSA_RELEASE_NAME    Install/release name (same as --release).
  MARSA_K3S_TOKEN       Agent-mode node-token (alternative to --token; keeps it out of ps).

${C_BOLD}Examples${C_RESET}
  sudo ./scripts/install.sh --domain marsa.example.com --email ops@example.com
  sudo ./scripts/install.sh --domain marsa.example.com --chart-version 0.1.0
  sudo ./scripts/install.sh --agent --server-url https://10.0.0.5:6443 --token <node-token>

${C_BOLD}DNS${C_RESET}
  Point both <domain> and api.<domain> (or a wildcard *.<domain>) at this
  server's public IP before running, so Let's Encrypt can issue certificates.
EOF
}

# --- Argument parsing ---------------------------------------------------------

TLS_ENABLED="true"

# Guard a value-taking flag: fail cleanly when its value is missing or is
# actually the next flag (e.g. `--domain` at end of line, or `--domain --no-tls`),
# instead of letting an unconditional `shift 2` blow up or eat the next flag.
require_arg_value() {
  local flag="$1" value="${2:-}"
  if [ -z "$value" ] || [ "${value#-}" != "$value" ]; then
    die "${flag} requires a value"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --agent)         MODE="agent"; shift ;;
    --server-url)    require_arg_value "$1" "${2:-}"; SERVER_URL="$2"; shift 2 ;;
    --token)         require_arg_value "$1" "${2:-}"; TOKEN="$2"; shift 2 ;;
    --domain)        require_arg_value "$1" "${2:-}"; DOMAIN="$2"; shift 2 ;;
    --email)         require_arg_value "$1" "${2:-}"; EMAIL="$2"; shift 2 ;;
    --chart-version) require_arg_value "$1" "${2:-}"; CHART_VERSION="$2"; shift 2 ;;
    --namespace)     require_arg_value "$1" "${2:-}"; NAMESPACE="$2"; shift 2 ;;
    --release)       require_arg_value "$1" "${2:-}"; RELEASE_NAME="$2"; shift 2 ;;
    --no-tls)        TLS_ENABLED="false"; shift ;;
    --skip-k3s)      SKIP_K3S="true"; shift ;;
    -h|--help)       usage; exit 0 ;;
    *)               die "Unknown argument: $1 (run --help for usage)" ;;
  esac
done

# --- Validation ---------------------------------------------------------------

if [ "$MODE" = "agent" ]; then
  # Agent mode joins an existing cluster; it installs no chart, so the server-only
  # flags are meaningless here. Reject them explicitly rather than silently ignore.
  [ -z "$DOMAIN" ]        || die "--domain is not valid in --agent mode (agents don't serve the app)"
  [ -z "$EMAIL" ]         || die "--email is not valid in --agent mode"
  [ -z "$CHART_VERSION" ] || die "--chart-version is not valid in --agent mode"
  [ "$TLS_ENABLED" = "true" ] || die "--no-tls is not valid in --agent mode"
  [ "$SKIP_K3S" = "false" ] || die "--skip-k3s is not valid in --agent mode"

  [ -n "$SERVER_URL" ] || { usage; echo; die "--agent requires --server-url"; }
  [ -n "$TOKEN" ]      || die "--agent requires --token (or set MARSA_K3S_TOKEN)"

  # Shape check: K3s server URL must be https://<host>:<port> (the supervisor API
  # on 6443 is TLS even on a bare IP — K3s ships its own PKI; the token pins the CA).
  if ! printf '%s' "$SERVER_URL" | grep -Eq '^https://[a-zA-Z0-9._-]+:[0-9]+$'; then
    die "--server-url '$SERVER_URL' must look like https://<host>:<port> (e.g. https://10.0.0.5:6443)"
  fi
else
  [ -n "$DOMAIN" ] || { usage; echo; die "--domain is required"; }

  # Basic domain shape check: at least one dot, no scheme, no path.
  if ! printf '%s' "$DOMAIN" | grep -Eq '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$'; then
    die "--domain '$DOMAIN' does not look like a bare domain (e.g. marsa.example.com)"
  fi

  if [ -z "$EMAIL" ] && [ "$TLS_ENABLED" = "true" ]; then
    EMAIL="admin@${DOMAIN}"
    warn "No --email given; defaulting Let's Encrypt registration to ${EMAIL}"
  fi
fi

# --- Pre-flight ---------------------------------------------------------------

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "This script must run as root. Re-run with: sudo $0 $*"
  fi
}

require_debian() {
  [ -r /etc/os-release ] || die "Cannot read /etc/os-release; unsupported OS"
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}:${ID_LIKE:-}" in
    debian:*|ubuntu:*|*:*debian*|*:*ubuntu*) ok "Detected ${PRETTY_NAME:-$ID}" ;;
    *) die "Unsupported OS '${PRETTY_NAME:-$ID}'. This installer targets Debian/Ubuntu." ;;
  esac
}

require_cmd() { command -v "$1" >/dev/null 2>&1; }

preflight() {
  info "Running pre-flight checks"
  require_root "$@"
  require_debian
  require_cmd curl || { info "Installing curl"; apt-get update -qq && apt-get install -y -qq curl; }
  ok "Pre-flight checks passed"
}

# --- K3s ----------------------------------------------------------------------

install_k3s() {
  if require_cmd k3s && systemctl is-active --quiet k3s 2>/dev/null; then
    ok "K3s already installed and running — skipping"
    return
  fi
  info "Installing K3s (this also provisions Traefik ingress + local-path storage)"
  # K3s bundles Traefik and local-path-provisioner, which is exactly what the
  # Marsa chart expects (see marsa-charts README § Target platform). The
  # kubeconfig is left at K3s's default mode 0600 (root-only) — this script and
  # Helm both run as root, so nothing needs it world-readable (see AgDR-0003).
  curl -sfL https://get.k3s.io | sh -

  info "Waiting for K3s node to become Ready"
  local tries=0
  until k3s kubectl get nodes 2>/dev/null | grep -q ' Ready'; do
    tries=$((tries + 1))
    [ "$tries" -ge 60 ] && die "K3s node did not become Ready within ~2 minutes"
    sleep 2
  done
  ok "K3s is up and the node is Ready"
}

install_k3s_agent() {
  if require_cmd k3s && systemctl is-active --quiet k3s-agent 2>/dev/null; then
    ok "K3s agent already installed and running — skipping"
    return
  fi
  info "Joining the cluster at ${SERVER_URL} as a K3s agent"
  # Agent install: same upstream installer as the server, but K3S_URL + K3S_TOKEN make
  # it register as a worker. The token goes via the env var (not k3s's argv) so it does
  # not leak into process listings on this node. Registration over 6443 is TLS — K3s
  # generates its own PKI and the token pins the server's CA hash.
  curl -sfL https://get.k3s.io | K3S_URL="$SERVER_URL" K3S_TOKEN="$TOKEN" sh -

  info "Waiting for the K3s agent to start"
  local tries=0
  until systemctl is-active --quiet k3s-agent 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -ge 60 ] && die "K3s agent did not become active within ~2 minutes"
    sleep 2
  done
  ok "K3s agent is up and has joined the cluster"
}

# --- Helm ---------------------------------------------------------------------

helm_meets_min() {
  # Returns 0 when installed Helm is >= MIN_HELM_MAJOR (OCI pulls + --rollback-on-failure).
  local ver major
  ver="$(helm version --template '{{.Version}}' 2>/dev/null | sed 's/^v//')" || return 1
  major="${ver%%.*}"
  [ "${major:-0}" -ge "$MIN_HELM_MAJOR" ]
}

install_helm() {
  # Never replace an operator's existing Helm — a PaaS installer upgrading a
  # system-wide tool out from under other workloads is too blunt. Install only
  # when Helm is absent; otherwise require the operator to upgrade deliberately.
  if require_cmd helm; then
    helm_meets_min || die "Helm $(helm version --template '{{.Version}}' 2>/dev/null) is installed, but Marsa requires Helm ${MIN_HELM_MAJOR}.x or newer. Upgrade Helm and re-run — this installer will not replace an existing Helm for you."
    ok "Helm $(helm version --template '{{.Version}}' 2>/dev/null) already installed — skipping"
    return
  fi
  info "Installing Helm (installer pinned to ${HELM_INSTALL_SCRIPT_TAG})"
  local get_helm="https://raw.githubusercontent.com/helm/helm/${HELM_INSTALL_SCRIPT_TAG}/scripts/get-helm-4"
  if [ -n "$HELM_VERSION" ]; then
    curl -sfL "$get_helm" | DESIRED_VERSION="$HELM_VERSION" bash
  else
    curl -sfL "$get_helm" | bash
  fi
  helm_meets_min || die "Helm install did not yield a ${MIN_HELM_MAJOR}.x+ version"
  ok "Helm $(helm version --template '{{.Version}}' 2>/dev/null) ready"
}

# --- Marsa --------------------------------------------------------------------

deploy_marsa() {
  if [ "$SKIP_K3S" = "true" ]; then
    export KUBECONFIG="${KUBECONFIG:-$K3S_KUBECONFIG}"
  else
    export KUBECONFIG="$K3S_KUBECONFIG"
    [ -r "$KUBECONFIG" ] || die "kubeconfig not readable at $KUBECONFIG"
  fi

  info "Deploying Marsa release '${RELEASE_NAME}' into namespace '${NAMESPACE}'"

  local args=(
    upgrade --install "$RELEASE_NAME" "$CHART_REF"
    --namespace "$NAMESPACE" --create-namespace
    --set "tls.enabled=${TLS_ENABLED}"
    --set "tls.domain=${DOMAIN}"
    --wait --timeout 10m --rollback-on-failure
  )
  [ -n "$EMAIL" ] && args+=(--set "email=${EMAIL}")
  [ -n "$IMAGE_TAG" ] && args+=(--set "image.tag=${IMAGE_TAG}")

  if [ -n "$CHART_VERSION" ]; then
    args+=(--version "$CHART_VERSION")
  else
    # No version pinned: resolve the newest published chart. --devel is required
    # so Helm's OCI "latest" resolution includes pre-releases — while Marsa is
    # pre-1.0 the registry only ships alpha/beta tags, and without --devel Helm
    # matches no stable version and fails with "could not locate a version".
    args+=(--devel)
    info "No --chart-version pinned; pulling the latest published chart (including pre-releases)"
  fi

  helm "${args[@]}"
  ok "Marsa deployed"
}

# --- Summary ------------------------------------------------------------------

summary() {
  local scheme="https"
  [ "$TLS_ENABLED" = "false" ] && scheme="http"

  cat <<EOF

${C_GREEN}${C_BOLD}Marsa is installed.${C_RESET}

  Web UI : ${scheme}://${DOMAIN}
  API    : ${scheme}://api.${DOMAIN}

Next steps:
EOF

  if [ "$TLS_ENABLED" = "true" ]; then
    cat <<EOF
  • Ensure DNS for ${DOMAIN} and api.${DOMAIN} points at this server's public IP
    so the HTTPS certificate can be issued.
EOF
  fi

  local token_file="/var/lib/rancher/k3s/server/node-token" node_token="<node-token>"
  [ -r "$token_file" ] && node_token="$(cat "$token_file")"

  cat <<EOF
  • To add a worker node, run this on each new machine (token already filled in):

      curl -fsSL https://raw.githubusercontent.com/marsa-cloud/marsa/main/scripts/install.sh \\
        | sudo bash -s -- --agent \\
            --server-url https://<private-ip>:6443 \\
            --token ${node_token}

    Replace <private-ip> with this server's address on the private network the
    nodes share.
  • Connect nodes over a private network — inter-node traffic is not encrypted by
    default (see marsa-cloud/marsa#24).
  • Re-run this script with the same arguments at any time to update Marsa.
EOF
}

agent_summary() {
  cat <<EOF

${C_GREEN}${C_BOLD}This node has joined the Marsa cluster.${C_RESET}

  Server : ${SERVER_URL}

Next steps:
  • Verify the node is Ready by running this on the SERVER:
      sudo k3s kubectl get nodes
  • Inter-node traffic is not encrypted by default — keep nodes on a private
    network (see marsa-cloud/marsa#24).
EOF
}

# --- Main ---------------------------------------------------------------------

main() {
  printf '%s%sMarsa installer%s\n' "$C_BOLD" "$C_BLUE" "$C_RESET"

  if [ "$MODE" = "agent" ]; then
    preflight "$@"
    install_k3s_agent
    agent_summary
    return
  fi

  preflight "$@"
  if [ "$SKIP_K3S" = "true" ]; then
    info "Skipping K3s install (--skip-k3s); using existing cluster via \$KUBECONFIG"
    export KUBECONFIG="${KUBECONFIG:-$K3S_KUBECONFIG}"
    kubectl get nodes >/dev/null 2>&1 || die "No reachable cluster at KUBECONFIG=$KUBECONFIG"
  else
    install_k3s
  fi
  install_helm
  deploy_marsa
  summary
}

main "$@"
