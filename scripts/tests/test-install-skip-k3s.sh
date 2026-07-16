#!/usr/bin/env bash
# scripts/tests/test-install-skip-k3s.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
stub="$(mktemp -d)"
log="$stub/calls.log"

cat >"$stub/curl" <<EOF
#!/usr/bin/env bash
echo "curl \$*" >>"$log"
case "\$*" in *get.k3s.io*) echo "FAIL: k3s bootstrap attempted under --skip-k3s" >&2; exit 99;; esac
exit 0
EOF
for c in helm kubectl k3s systemctl apt-get; do
  cat >"$stub/$c" <<EOF
#!/usr/bin/env bash
echo "$c \$*" >>"$log"
case "$c:\$1" in helm:version) echo 'v3.18.0';; kubectl:get) echo 'node Ready';; esac
exit 0
EOF
done

# `id` is stubbed too: install.sh's preflight() calls require_root(), which
# shells out to `id -u` and dies unless it's 0. The test runs as the invoking
# (non-root) dev/CI user, so without this stub the script would die at the
# root check before ever reaching the --skip-k3s branch, regardless of
# whether that branch is implemented correctly.
cat >"$stub/id" <<EOF
#!/usr/bin/env bash
echo "id \$*" >>"$log"
case "\$*" in *-u*) echo 0 ;; *) echo 0 ;; esac
EOF

chmod +x "$stub"/*

# install.sh's deploy_marsa() checks `[ -r "$KUBECONFIG" ]` before invoking helm
# (a real safety check against a missing/unreadable kubeconfig). kubectl/helm are
# stubbed here and never read this file's contents, but the file must exist and
# be readable for the script to get past that guard.
touch "$stub/kubeconfig"

PATH="$stub:$PATH" KUBECONFIG="$stub/kubeconfig" HOME="$stub" \
  bash "$here/../install.sh" --domain marsa.test --skip-k3s --no-tls || true

grep -q 'helm upgrade --install' "$log" || { echo "FAIL: helm install not invoked"; exit 1; }
! grep -q 'get.k3s.io' "$log" || { echo "FAIL: k3s bootstrap ran"; exit 1; }
echo "PASS: --skip-k3s installs via helm without bootstrapping K3s"
