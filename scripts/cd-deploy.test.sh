#!/usr/bin/env bash
#
# Regression test for scripts/cd-deploy.sh.
#
# Locks the load-bearing dispatch guard (the forced-command SSH boundary) and
# the per-mode helm flag selection. It runs the REAL cd-deploy.sh as a
# subprocess with a stubbed `helm` on PATH, so the actual anchored regexes are
# exercised — a future edit that loosens an anchor lets an injection-shaped
# input reach `helm`, which fails this test.
#
# Usage: bash scripts/cd-deploy.test.sh   (must run under bash, not sh)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CD_DEPLOY="$SCRIPT_DIR/cd-deploy.sh"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# Stub helm: `get metadata` answers with a version line (image mode reads the
# installed chart version); any other call (the `upgrade`) records its full
# argument list to $HELM_LOG so the test can assert which flags were used.
cat > "$workdir/helm" <<'STUB'
#!/usr/bin/env bash
if [ "${1:-}" = "get" ] && [ "${2:-}" = "metadata" ]; then
  echo "version: 0.0.1-alpha.9"
  exit 0
fi
printf '%s\n' "$*" >> "$HELM_LOG"
exit 0
STUB
chmod +x "$workdir/helm"

pass=0
fail=0

# Run cd-deploy.sh with the stub helm on PATH; returns the script's exit code
# and leaves the upgrade invocation (if any) in $HELM_LOG.
run_deploy() {
  : > "$HELM_LOG"
  PATH="$workdir:$PATH" HELM_LOG="$HELM_LOG" bash "$CD_DEPLOY" "$1" >/dev/null 2>&1
}

HELM_LOG="$workdir/helm.log"

# --- 1. Invalid / injection inputs: must exit non-zero and never reach helm ---
invalid=(
  ""                                   # empty
  "sha-"                               # prefix only
  "sha-ABC123"                         # uppercase not allowed
  "sha-a,foo=bar"                      # comma → extra helm --set pair
  "chart:latest"                       # non-semver
  "chart:0.0"                          # incomplete semver
  "chart:0.0.1;rm -rf /"               # command injection
  "chart:0.0.1 --set image.tag=evil"   # flag injection via space
  'chart:$(id)'                        # command substitution shape
  "helm uninstall marsa"               # arbitrary command
  "chart:0.0.1-alpha.3 sha-abc"        # two tokens / trailing junk
)
for bad in "${invalid[@]}"; do
  if run_deploy "$bad"; then
    echo "FAIL  accepted invalid input: [$bad]"; fail=$((fail + 1))
  elif [ -s "$HELM_LOG" ]; then
    echo "FAIL  helm ran for invalid input: [$bad]"; fail=$((fail + 1))
  else
    echo "PASS  refused: [$bad]"; pass=$((pass + 1))
  fi
done

# --- 2. Valid image roll: chart pinned, --reuse-values --set image.tag --------
if run_deploy "sha-abc1234" \
  && grep -q -- "--reuse-values" "$HELM_LOG" \
  && grep -q -- "--set image.tag=sha-abc1234" "$HELM_LOG" \
  && grep -q -- "--version 0.0.1-alpha.9" "$HELM_LOG" \
  && ! grep -q -- "--reset-then-reuse-values" "$HELM_LOG"; then
  echo "PASS  image roll → --reuse-values --set image.tag (chart pinned to installed)"
  pass=$((pass + 1))
else
  echo "FAIL  image roll flags — got: $(cat "$HELM_LOG")"; fail=$((fail + 1))
fi

# --- 3. Valid chart bump: --reset-then-reuse-values --version, image untouched -
if run_deploy "chart:1.2.3-rc.1" \
  && grep -q -- "--reset-then-reuse-values" "$HELM_LOG" \
  && grep -q -- "--version 1.2.3-rc.1" "$HELM_LOG" \
  && ! grep -q -- "--set image.tag" "$HELM_LOG"; then
  echo "PASS  chart bump → --reset-then-reuse-values --version (image untouched)"
  pass=$((pass + 1))
else
  echo "FAIL  chart bump flags — got: $(cat "$HELM_LOG")"; fail=$((fail + 1))
fi

echo "---"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
