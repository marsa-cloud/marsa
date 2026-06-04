# VPS Installer: single bash script provisioning K3s + Helm + the OCI chart

> In the context of letting an operator stand Marsa up on a bare Debian/Ubuntu VPS, facing the gap between "a Helm chart exists" and "a running system on a fresh server", I decided to ship **a single idempotent bash script (`scripts/install.sh`) that provisions K3s and Helm 3.8+ when absent and deploys the chart via `helm upgrade --install`**, to achieve a one-command install/update flow, accepting that it pipes the official K3s/Helm installers to a root shell and is coupled to the chart's not-yet-published v0.1 release.

## Context

Issue #16 asks for a bash script that installs — and on re-run, updates — Marsa on a Debian/Ubuntu VPS, with HTTPS, given a `--domain`. The marsa-charts README already documents the intended install UX: K3s (its bundled Traefik + local-path are what the chart targets), Helm pulling the chart from `oci://ghcr.io/marsa-cloud/charts/marsa`, and Let's Encrypt for public-ingress TLS. The script's job is to automate that documented path on a clean host. No K3s is assumed present; the chart is assumed to exist (it is not yet published — v0.1.0).

## Options Considered

| Option                                                                        | Pros                                                                                                      | Cons                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Single bash script: provision K3s+Helm, `helm upgrade --install`** (chosen) | One command; idempotent install≡update; matches the documented chart UX; no extra runtime deps on the VPS | Pipes upstream installers to root; couples to the chart's release cadence          |
| Ansible / cloud-init playbook                                                 | Declarative, reusable, better secret handling                                                             | Heavy dependency for an MVP single-server install; operator must learn/run Ansible |
| Document manual `curl k3s` + `helm install` steps                             | Zero code to maintain                                                                                     | Not idempotent; error-prone; defeats the "one invocation updates" requirement      |
| Bundle K3s/Helm binaries in-repo                                              | No network fetch at install time                                                                          | Repo bloat; stale binaries; arch-specific; we'd own security patching              |

## Decision

Chosen: **single bash script**, because it is the lightest thing that satisfies #16's idempotent install/update requirement and mirrors the UX the chart README already promises. Specific calls within it:

- **K3s as the provisioner** — the chart explicitly targets K3s's bundled Traefik ingress + `local-path` storage; installing K3s is the only way to get the dependencies the chart assumes. Installed only when absent.
- **Helm 3.8+ via the official installer** — 3.8 is the floor for native OCI registry pulls, and the chart is distributed as an OCI artifact (AgDR-0003 in marsa-charts). The `get-helm-3` installer is **pinned to a release tag** (`v3.16.4`), not the moving `main` branch, for supply-chain hygiene; `MARSA_HELM_VERSION` can pin the Helm version itself.
- **Idempotency via `helm upgrade --install --atomic`** — the same invocation installs or updates; `--atomic` rolls back a failed first apply so a re-run starts clean. The K3s/Helm steps no-op when already present.
- **kubeconfig left at K3s default mode 0600** — the script and Helm both run as root, so the kubeconfig is never made world-readable (an earlier draft set `--write-kubeconfig-mode 644`; dropped).
- **`--domain` required + shape-validated**; `--email` defaults to `admin@<domain>` so a minimal invocation still completes ACME registration.

Accepted tradeoff — **piping upstream installers to a root shell**: both `get.k3s.io` and Helm's `get-helm-3` are the vendor-recommended install methods; full GPG/checksum verification of the _installer scripts_ is beyond standard practice and adds brittle complexity. Mitigated by pinning the Helm installer to a tag (removing the `main`-branch moving target). K3s's own installer checksum-verifies the binary it downloads. Revisit if Marsa ever ships a hardened/air-gapped install profile.

## Consequences

- An operator runs one command to get a working HTTPS Marsa, and re-runs the same command to update — no separate upgrade path to document.
- The script cannot be exercised fully end-to-end until the OCI chart is published (v0.1.0); `--chart-version` is left unpinned (Helm pulls latest) until then. Static + behavioural checks (arg validation, `bash -n`, `--help`) are the current test surface; a shell script has no TS coverage gate.
- The script is coupled to the chart's value schema (`tls.enabled`, `tls.domain`, `email`) — verified against `charts/marsa/values.yaml`. If the chart renames those, the script's `--set` flags must follow.
- Air-gapped / offline installs are out of scope; the script fetches K3s, Helm, and the chart over the network.

## Amendment — 2026-06-04 (#50): first real-VPS run exposed three breakages

The first end-to-end run on a real VPS (now that the chart is published as `0.0.1-alpha.1`) surfaced three failures the static checks couldn't catch. These supersede the matching points above.

- **Pre-release version resolution → add `--devel`.** The original "no `--chart-version` ⇒ Helm pulls latest" assumed a stable release exists. The registry only ships pre-release tags (`0.0.1-alpha.1`) while Marsa is pre-1.0, and Helm's OCI "latest" resolution **excludes pre-releases** — so an unpinned install died with `could not locate a version matching provided version string`. Fix: pass `--devel` (≡ constraint `>0.0.0-0`) when no version is pinned, so resolution includes pre-releases. Verified: `helm show chart oci://… --devel` resolves `0.0.1-alpha.1`, plain does not. The installer now ships **pre-release charts by default** — acceptable and intended while pre-1.0; `--chart-version` still pins an exact release.
- **`--atomic` → `--rollback-on-failure`; Helm floor 3.8 → 3.18.** Helm 3.18 renamed `--atomic` to `--rollback-on-failure` and Helm 4 removed `--atomic` outright. Rather than feature-detect, we always use `--rollback-on-failure` and raise `MIN_HELM_MINOR` to 18 so the flag is guaranteed present (3.18 still satisfies the OCI ≥3.8 requirement). `get-helm-3` installs ≥3.18 as current stable, so fresh installs are unaffected.
- **Distribution URL → GitHub raw, not the OVH vanity redirect.** The README's `https://get.marsa.gomaa.ovh` resolves to an OVH web-redirect that only listens on port 80 (no TLS cert), so `https://` reset the connection before the script was even fetched. The README now points at `https://raw.githubusercontent.com/marsa-cloud/marsa/main/scripts/install.sh` (real TLS, zero infra). A pretty vanity URL over HTTPS is deferred to the real-domain purchase (#49) — via a TLS-terminating proxy (e.g. Cloudflare), not OVH's free redirect.

## Artifacts

- Issue: marsa-cloud/marsa#16, marsa-cloud/marsa#50 (amendment)
- PR: marsa-cloud/marsa#48
- File: `scripts/install.sh`
- Related: marsa-charts README § Target platform / Install; marsa-charts AgDR-0003 (OCI distribution), AgDR-0004 (subchart/anti-scope), AgDR-0005 (public-ingress TLS).
