#!/usr/bin/env bash
#
# install.sh — install (or update) Marsa on a Debian/Ubuntu VPS.
#
# What it does, in order:
#   1. Pre-flight checks (root, Debian/Ubuntu, required tools)
#   2. Installs K3s if absent (brings its own Traefik ingress + local-path storage)
#   3. Installs Helm 3.8+ if absent (3.8+ is required for native OCI registry pulls)
#   4. helm upgrade --install of the Marsa chart from the OCI registry
#
# Re-running the script with the same arguments updates an existing install
# (steps 2 and 3 are skipped when already present; step 4 is an idempotent
# `helm upgrade --install`).
#
# Usage:
#   sudo ./install.sh --domain marsa.example.com [--email you@example.com] [options]
#
# See --help for the full flag list.

set -euo pipefail

# --- Defaults -----------------------------------------------------------------

CHART_REF="${MARSA_CHART_REF:-oci://ghcr.io/marsa-cloud/charts/marsa}"
RELEASE_NAME="${MARSA_RELEASE_NAME:-marsa}"
NAMESPACE="marsa"
DOMAIN=""
EMAIL=""
CHART_VERSION=""        # empty → Helm pulls the latest published version
MIN_HELM_MINOR=8        # Helm 3.8+ for OCI support
K3S_KUBECONFIG="/etc/rancher/k3s/k3s.yaml"
# Helm's official get-helm-3 installer, pinned to a release tag rather than the
# moving `main` branch (supply-chain hygiene — see AgDR-0003). Overridable for
# testing. The pinned script still installs the latest stable Helm by default;
# set MARSA_HELM_VERSION to pin the Helm version itself.
HELM_INSTALL_SCRIPT_TAG="${MARSA_HELM_INSTALL_SCRIPT_TAG:-v3.16.4}"
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

Installs or updates Marsa on a fresh Debian/Ubuntu VPS. Provisions K3s and Helm
as needed, then deploys the Marsa Helm chart with HTTPS via Let's Encrypt.

${C_BOLD}Usage${C_RESET}
  sudo ./install.sh --domain <domain> [--email <email>] [options]

${C_BOLD}Required${C_RESET}
  --domain <domain>     Domain Marsa is served on (drives ingress + TLS).
                        The web UI is served on <domain>, the API on api.<domain>.

${C_BOLD}Options${C_RESET}
  --email <email>       Email for Let's Encrypt registration.
                        Defaults to admin@<domain> if omitted.
  --chart-version <v>   Pin a specific chart version. Default: latest published.
  --namespace <ns>      Kubernetes namespace. Default: ${NAMESPACE}.
  --release <name>      Helm release name. Default: ${RELEASE_NAME}.
  --no-tls              Disable HTTPS (sets tls.enabled=false). Not recommended.
  -h, --help            Show this help and exit.

${C_BOLD}Environment overrides${C_RESET}
  MARSA_CHART_REF       OCI chart reference. Default: ${CHART_REF}
  MARSA_RELEASE_NAME    Helm release name (same as --release).

${C_BOLD}Examples${C_RESET}
  sudo ./install.sh --domain marsa.example.com --email ops@example.com
  sudo ./install.sh --domain marsa.example.com --chart-version 0.1.0

${C_BOLD}DNS${C_RESET}
  Point both <domain> and api.<domain> (or a wildcard *.<domain>) at this
  server's public IP before running, so Let's Encrypt can issue certificates.
EOF
}

# --- Argument parsing ---------------------------------------------------------

TLS_ENABLED="true"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)        DOMAIN="${2:-}"; shift 2 ;;
    --email)         EMAIL="${2:-}"; shift 2 ;;
    --chart-version) CHART_VERSION="${2:-}"; shift 2 ;;
    --namespace)     NAMESPACE="${2:-}"; shift 2 ;;
    --release)       RELEASE_NAME="${2:-}"; shift 2 ;;
    --no-tls)        TLS_ENABLED="false"; shift ;;
    -h|--help)       usage; exit 0 ;;
    *)               die "Unknown argument: $1 (run --help for usage)" ;;
  esac
done

# --- Validation ---------------------------------------------------------------

[ -n "$DOMAIN" ] || { usage; echo; die "--domain is required"; }

# Basic domain shape check: at least one dot, no scheme, no path.
if ! printf '%s' "$DOMAIN" | grep -Eq '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$'; then
  die "--domain '$DOMAIN' does not look like a bare domain (e.g. marsa.example.com)"
fi

if [ -z "$EMAIL" ] && [ "$TLS_ENABLED" = "true" ]; then
  EMAIL="admin@${DOMAIN}"
  warn "No --email given; defaulting Let's Encrypt registration to ${EMAIL}"
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

# --- Helm ---------------------------------------------------------------------

helm_supports_oci() {
  # Returns 0 when installed Helm is >= 3.MIN_HELM_MINOR.
  local ver major minor
  ver="$(helm version --template '{{.Version}}' 2>/dev/null | sed 's/^v//')" || return 1
  major="${ver%%.*}"
  minor="${ver#*.}"; minor="${minor%%.*}"
  [ "${major:-0}" -gt 3 ] && return 0
  [ "${major:-0}" -eq 3 ] && [ "${minor:-0}" -ge "$MIN_HELM_MINOR" ]
}

install_helm() {
  if require_cmd helm && helm_supports_oci; then
    ok "Helm $(helm version --template '{{.Version}}' 2>/dev/null) already installed — skipping"
    return
  fi
  if require_cmd helm; then
    warn "Installed Helm is older than 3.${MIN_HELM_MINOR} (no OCI support); upgrading"
  fi
  info "Installing Helm (installer pinned to ${HELM_INSTALL_SCRIPT_TAG})"
  local get_helm="https://raw.githubusercontent.com/helm/helm/${HELM_INSTALL_SCRIPT_TAG}/scripts/get-helm-3"
  if [ -n "$HELM_VERSION" ]; then
    curl -sfL "$get_helm" | DESIRED_VERSION="$HELM_VERSION" bash
  else
    curl -sfL "$get_helm" | bash
  fi
  helm_supports_oci || die "Helm install did not yield a 3.${MIN_HELM_MINOR}+ version"
  ok "Helm $(helm version --template '{{.Version}}' 2>/dev/null) ready"
}

# --- Marsa --------------------------------------------------------------------

deploy_marsa() {
  export KUBECONFIG="$K3S_KUBECONFIG"
  [ -r "$KUBECONFIG" ] || die "kubeconfig not readable at $KUBECONFIG"

  info "Deploying Marsa release '${RELEASE_NAME}' into namespace '${NAMESPACE}'"

  local args=(
    upgrade --install "$RELEASE_NAME" "$CHART_REF"
    --namespace "$NAMESPACE" --create-namespace
    --set "tls.enabled=${TLS_ENABLED}"
    --set "tls.domain=${DOMAIN}"
    --wait --timeout 10m --atomic
  )
  [ -n "$CHART_VERSION" ] && args+=(--version "$CHART_VERSION")
  [ -n "$EMAIL" ] && args+=(--set "email=${EMAIL}")

  if [ -z "$CHART_VERSION" ]; then
    info "No --chart-version pinned; Helm will pull the latest published chart"
  fi

  helm "${args[@]}"
  ok "Marsa deployed"
}

# --- Summary ------------------------------------------------------------------

summary() {
  cat <<EOF

${C_GREEN}${C_BOLD}Marsa is installed.${C_RESET}

  Web UI : https://${DOMAIN}
  API    : https://api.${DOMAIN}
  Release: ${RELEASE_NAME}  (namespace: ${NAMESPACE})

Next steps:
  • Ensure DNS for ${DOMAIN} and api.${DOMAIN} points at this server's public IP
    so Let's Encrypt can complete the HTTP-01 challenge.
  • Inspect the deployment:  KUBECONFIG=${K3S_KUBECONFIG} kubectl -n ${NAMESPACE} get pods
  • Re-run this script with the same arguments at any time to update Marsa.
EOF
}

# --- Main ---------------------------------------------------------------------

main() {
  printf '%s%sMarsa installer%s\n' "$C_BOLD" "$C_BLUE" "$C_RESET"
  preflight "$@"
  install_k3s
  install_helm
  deploy_marsa
  summary
}

main "$@"
