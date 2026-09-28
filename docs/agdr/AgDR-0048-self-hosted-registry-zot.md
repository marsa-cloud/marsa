---
id: AgDR-0048
timestamp: 2026-09-23T00:00:00Z
agent: claude
model: claude-opus-5-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#78
---

# Self-hosted registry: Zot (minimal), push in-cluster, pull by public name

> In the context of storing images built in the cluster (#78, v0.2 Goal 3), facing unbounded disk growth and a pull credential copied into every environment namespace, I decided on **Zot's minimal image with a retention policy and a read-only pull user, pushed to over the in-cluster Service and pulled through `registry.<domain>`**, to achieve bounded storage and a leaked pull secret that cannot push, accepting one more StatefulSet (~25 MiB idle) and that rolling back further than `keepImages` builds fails at image pull.

## Context

Phase C builds images inside the cluster (spec:
`docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md`). They need a registry
that the build pushes to and every node pulls from. Two constraints drive the choice:

- **Disk.** #78 names the "Disk Space Trap": without reclaiming old layers the registry fills the
  node. The cleanup must not need the registry offline.
- **Credentials.** The pull credential is materialised as an image-pull Secret in every environment
  namespace (AgDR-0036), so it is the one most likely to leak. It must not be able to push.

A node's containerd pulls with the node's DNS, not cluster DNS, so it cannot resolve
`*.svc.cluster.local`. A pod resolving the public name hits its own loopback in e2e
(`127.0.0.1.nip.io`) and depends on hairpin NAT on clouds that NAT the public IP.

## Options Considered

| Option                          | Pros                                                                                                 | Cons                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Distribution (`registry:2/3`)   | Lightest (10 MiB idle measured); the default everyone knows                                          | No retention policies; GC needs the registry read-only; htpasswd has no permission levels (read-only needs a token server) |
| Zot, full image                 | Online GC, retention, per-user access control                                                        | 51 MiB idle and ~13% of a core busy constantly on extensions (search/scrub) Marsa does not use                             |
| **Zot, `zot-minimal` (chosen)** | 23 MiB idle, ~0% CPU; online GC, retention and access control all work without extensions (verified) | Smaller community than Distribution                                                                                        |
| Harbor                          | Scanning, UI, replication                                                                            | 2–4 GB RAM minimum, its own Postgres and Redis; #78 rules out a UI                                                         |

Verified on `zot-minimal:v2.1.21` before choosing: the config passes `zot verify`; `marsa-pull`
reads but gets `DENIED` on push and 403 on delete; `keepTags: [{ mostRecentlyPushedCount: 2 }]`
removed the two oldest of four tags in one GC cycle; deleting every manifest by digest removes the
repository (`tags/list` then 404 `NAME_UNKNOWN`); a k3d node pulled `registry.127.0.0.1.nip.io/…`
through Traefik with `registries.yaml` skipping TLS verification.

## Decision

Chosen: **Zot minimal**, because it is the only option that bounds disk with configuration rather
than Marsa code and gives a read-only pull user without another component, at near-Distribution
cost.

- **Chart (marsa-charts):** a `marsa-registry` StatefulSet + PVC + Service on `:5000`; config keeps
  `registry.keepImages` (default 10) most recently pushed tags per repository; htpasswd users
  `marsa-push` (read/create/update/delete) and `marsa-pull` (read); generate-once
  `marsa-registry-secrets`; IngressRoute host `registry.<domain>` with the existing Let's Encrypt
  resolver.
- **Push/pull split:** pods (build Jobs, the api) talk to `http://marsa-registry:5000`; nodes pull
  `registry.<domain>/<app>:<tag>`. A registry stores `repo:tag`, not the hostname a client used.
- **Api:** an `ImageRegistry` runtime port. `pullCredentialsFor(imageRef)` returns the `marsa-pull`
  credentials for images under `MARSA_REGISTRY_HOST`, ahead of the app's stored credentials;
  `deleteRepository(appSlug)` runs when an app is deleted. The Zot adapter speaks plain `fetch` to
  the OCI distribution API as `marsa-push`.

## Consequences

- Rolling back to a build older than the kept count fails at pull (`ImagePullBackOff`, surfaced by
  `readDeployFailure`). A guard returning a clear 409 is a possible follow-up.
- `--no-tls` installs and k3d skip TLS verification for `registry.<domain>` via `registries.yaml`,
  written by `install.sh` and `e2e-up.sh`; real installs rely on Let's Encrypt.
- The api holds `marsa-push` so it can delete repositories.
- The chart must be released before an api that requires the registry env vars.
- Storage is one node's PVC, like Marsa's own Postgres (see #209).

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md`
- Plan: `docs/superpowers/plans/2026-09-23-self-hosted-registry.md`
- Chart PR: marsa-cloud/marsa-charts#32
- Ticket: marsa-cloud/marsa#78
