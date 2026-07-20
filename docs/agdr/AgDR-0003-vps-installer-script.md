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

## Amendment — 2026-07-20 (#122): `--rollback-on-failure` is Helm 4-only; require Helm 4, never upgrade

The 2026-06-04 amendment above is **factually wrong on both of its Helm claims** and this supersedes it. Verified against Helm's source rather than restated:

| Claim (2026-06-04)                                        | Reality                                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Helm 3.18 renamed `--atomic` to `--rollback-on-failure`" | False. Helm 3.18.0 and 3.21.3 define only `--atomic` (`cmd/helm/upgrade.go:274`). `--rollback-on-failure` first appears in Helm 4 (`v4.1.3` `pkg/cmd/upgrade.go:289`). |
| "Helm 4 removed `--atomic` outright"                      | False. `--atomic` is still present in Helm 4.1.3, deprecated and aliased to the same field (`pkg/cmd/upgrade.go:290-291`).                                             |

`MIN_HELM_MINOR=18` was set on the first of these, which is what broke the installer.

The error was invisible for six weeks because every machine that ran the installer happened to have Helm 4 already. The first real E2E run (the #122 harness, GitHub Actions run `29727378084`) hit a runner with Helm **3.21.3** preinstalled — which passed the `>= 3.18` gate, so the installer skipped its own Helm install and then handed Helm 3 a Helm 4 flag:

```
✓ Helm v3.21.3 already installed — skipping
Error: unknown flag: --rollback-on-failure
```

So the installer was broken for **any operator with Helm 3.x already on the box**. This is exactly the class of regression that installer-verification-in-CI (#55, folded into #122) exists to catch, and it was caught on the harness's first run.

Decided:

- **Floor becomes major-version based: `MIN_HELM_MAJOR=4`.** `helm_meets_min` compares the major version only; the minor-version logic is gone.
- **Bootstrap moves to `get-helm-4`, pinned to `v4.1.3`.** `get-helm-3` installs Helm 3 by design, so raising the floor without moving the script would make the installer fail its own check on every fresh box. `get-helm-4` exists from tag `v4.1.0` onward (absent at `v4.0.1` and earlier), so the pin cannot go below `v4.1.0`; `v4.1.3` is chosen as the newest at time of writing, not as a floor.
- **Never upgrade an existing Helm — error instead.** If Helm is present but older than 4, the installer now dies with an actionable message rather than replacing it. A PaaS installer silently swapping a system-wide tool out from under an operator's other workloads is too blunt an action to take unprompted. Installation happens only when Helm is **absent**.
- **`--atomic` was considered and rejected — and it was the cheaper fix.** Since Helm 4 only deprecated `--atomic` rather than removing it, a one-word change would have worked on Helm 3.8+ _and_ Helm 4, with no version floor, no bootstrap change, and no operator-facing behaviour change. It was rejected as an operator call: Marsa standardises on Helm 4 rather than carrying a deprecated flag, accepting that operators on Helm 3 must upgrade manually before installing. Anyone revisiting this should know the cheap option was available and declined, not overlooked.

Consequence for `scripts/cd-deploy.sh`, which passes `--rollback-on-failure` twice and is unchanged here: it is safe on any host provisioned by `install.sh` **from 2026-06-04 onward**, since that is when the installer began requiring the flag's presence. It is _not_ universally safe — `cd-deploy.sh` (2026-06-28) is wired up by a manual one-time setup that never re-runs `install.sh`, so a host provisioned before 2026-06-04 can still be running Helm 3 with a working Marsa release, and enabling CD on it would fail in the pipeline against production. Blast radius is near-zero at pre-1.0 alpha, but the two scripts are coupled through the Helm-4 floor: if it is ever lowered, `cd-deploy.sh` must change with it.

The E2E workflow installs Helm 4 explicitly (runners ship Helm 3), which means the `get-helm-4` bootstrap path itself is **not** exercised in CI — only the "Helm 4 already present" path is. That gap is accepted for now.

## Amendment — 2026-06-07 (#29): `--agent` mode to join worker nodes

The installer was server-only — it could stand up a single K3s server but offered no
first-class way to add nodes (issue #29: e.g. running the DB on a separate server from the
backend). The only prior support was copy-paste guidance text. This amendment adds a join
mode to the **same script**, extending AgDR-0003's "one bash script provisions the cluster"
decision to "…and joins nodes to it".

- **`--agent --server-url <url> --token <token>` installs K3s as an agent**, not a server.
  Mode is selected by a `MODE` variable (`server` default). Agent mode runs a much shorter
  path — `preflight → install_k3s_agent → agent_summary` — with **no Helm, no chart, no
  domain/TLS** (a worker node serves none of the app). The existing server path is unchanged
  except that `summary()` now prints a ready-to-paste `install.sh --agent` join command.
- **Mode-aware validation.** Server mode still requires `--domain`. Agent mode requires
  `--server-url` (shape-checked `https://<host>:<port>`) + `--token`, and **rejects** the
  server-only flags (`--domain` / `--email` / `--no-tls` / `--chart-version`) rather than
  silently ignoring them.
- **Token handling.** The token is passed to the K3s installer as the **`K3S_TOKEN` env
  var**, not on `k3s`'s argv, so it doesn't leak into process listings on the node. The
  script also accepts the token from `MARSA_K3S_TOKEN` (env) as an alternative to `--token`
  to keep it out of shell history / the script's own argv.
- **Server IP stays a placeholder** in the printed join command (`<private-ip>`): the server
  can't reliably tell which of its interfaces is the private one, so auto-detecting risks
  emitting a public IP. The node-token _is_ auto-substituted (unambiguous, read from
  `/var/lib/rancher/k3s/server/node-token`).
- **Inter-node encryption deferred to #24 ("Marsa Networking within Apps").** The K3s
  control plane (node registration on 6443) is already TLS — K3s ships its own PKI and the
  token pins the server CA. But the pod/service **data plane** (flannel VXLAN overlay) is
  plaintext by default. Rather than bundle an encryption strategy (wireguard-native flannel /
  linkerd / cert-manager / host VPN) into this feature, the MVP **assumes a private network**
  and documents that constraint with a warning; #24 owns the post-MVP encryption decision.

## Artifacts

- Issue: marsa-cloud/marsa#16, marsa-cloud/marsa#50 (amendment), marsa-cloud/marsa#29 (agent mode)
- PR: marsa-cloud/marsa#48
- File: `scripts/install.sh`
- Related: marsa-cloud/marsa#24 (inter-node encryption, deferred); marsa-charts README
  § Target platform / Install; marsa-charts AgDR-0003 (OCI distribution), AgDR-0004
  (subchart/anti-scope), AgDR-0005 (public-ingress TLS).
