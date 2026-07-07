---
id: AgDR-0036
timestamp: 2026-07-06T18:35:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#99
---

# Private-image deploys take structured registry credentials, encrypted at rest, materialized as a dockerconfigjson Secret in the deploy seam

> In the context of extending the #98 public-image deploy path to **private** images (#99, sub-issue of #77), facing the choice of _what shape_ registry credentials take on the deploy API and _where_ the Kubernetes pull-Secret is built, I decided to accept **structured `{ registry, username, password }`** on `DeployAppCommand`, encrypt it at rest with the existing `SecretCipherService` (AES-256-GCM, [AgDR-0006]), and materialize a `kubernetes.io/dockerconfigjson` Secret inside the existing **render → apply** seam ([AgDR-0029]/[AgDR-0031]/[AgDR-0032]), to achieve a validatable contract that works unchanged across the common registries, accepting that a registry that thinks of its credential as a single "API key / token" must place that token in the `password` field alongside a username.

## Context

- #98 deploys public images end-to-end. #99 adds private images: operator-supplied credentials, stored encrypted, surfaced to the cluster so the kubelet can pull.
- The groundwork already exists — **no migration, no new crypto**: the nullable `App.imagePullCredentialsEnc` column (`Migration20260628162043`), `SecretCipherService` ([AgDR-0006], `@Global` `CryptoModule`), and the `DeployBackend.apply()` + `renderManifests()` seam ([AgDR-0029]).
- A Kubernetes image-pull Secret is `type: kubernetes.io/dockerconfigjson`, whose payload's load-bearing field is `auth = base64("<username>:<password>")` — plain HTTP Basic auth. **There is no token-only form.** Docker Hub and GHCR both require a real username alongside a PAT; ECR (`AWS`) and GCP Artifact Registry (`_json_key` / `oauth2accesstoken`) use a fixed sentinel username. A username field is therefore unavoidable.

## Options Considered

| Option                                                     | Pros                                                                                                                                                                                                                                                     | Cons                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Structured `{ registry, username, password }` (chosen)** | Validatable per-field at the DTO boundary; clean OpenAPI/Zod types for the web form; API assembles the `dockerconfigjson` (incl. the `auth` field) server-side; works unchanged for Docker Hub, GHCR, ECR, GCP AR (`password` doubles as the token slot) | Operators used to thinking "just an API key" must learn the token goes in `password` — mitigated by field docs              |
| `{ registry, token }` with sentinel-defaulted username     | Friendlier for pure-token registries                                                                                                                                                                                                                     | Breaks Docker Hub & GHCR (they need the _real_ username) — a footgun for the two commonest cases                            |
| Raw `.dockerconfigjson` blob                               | Maximum flexibility; stored/applied verbatim                                                                                                                                                                                                             | Opaque contract; poor web-form UX; can't validate shape → malformed creds fail late at cluster apply instead of a clean 400 |

## Decision

Chosen: **structured `{ registry, username, password }`**, because it is the only shape that (a) validates cleanly at the DTO boundary (`ValidationPipe` already runs `whitelist` + `forbidNonWhitelisted` + `transform`, so a malformed object is a 400, not a stuck rollout), (b) generates good web types for #109, and (c) covers every common registry — the "API key" case is just a token placed in `password`, matching exactly what `docker login` does. `password` is documented as _"password or access token (PAT / API key)"_ so the token slot is discoverable.

Mechanics:

- **Encrypt** in `DeployAppUseCase`: `cipher.encrypt(JSON.stringify(creds))` → `App.imagePullCredentialsEnc`. Plaintext is never persisted to Postgres.
- **Materialize** in the deploy seam: `renderManifests` builds `buildDockerConfigJson(creds)` → a `V1Secret` (`stringData['.dockerconfigjson']`) named `<slug>-registry`, adds `imagePullSecrets: [{ name }]` to the Deployment pod spec, and includes the Secret in `RenderedManifests`. `DirectApplyDeployBackend.apply()` SSA-applies the Secret (same field manager) before the Deployment.
- **Failure surfacing** reuses existing machinery — wrong credentials manifest as `ImagePullBackOff`, already read live by `readRolloutStatus` (#100) and `readDeployFailure` (#115). No new failure-handling code.

## Consequences

- The pull-Secret is rendered from the same `App`/`Release` model as the rest of the bundle and applied idempotently via SSA — a re-deploy re-applies it, consistent with [AgDR-0032].
- Credentials live decrypted only in memory during render→apply; at rest they are AES-256-GCM ciphertext in Postgres and base64 (not encrypted) inside the K8s Secret — etcd-level encryption is a cluster concern out of scope here.
- The `password` field naming requires operator education; accepted as the least-surprising option given the dockerconfigjson protocol.
- No new dependency, no migration, no new crypto primitive — the change is contained to the deployments feature + the kubernetes module.

## Artifacts

- Ticket: marsa-cloud/marsa#99
- Reuses: [AgDR-0006] (secret encryption at rest), [AgDR-0029] (deploy seam), [AgDR-0031] (`@kubernetes/client-node`), [AgDR-0032] (server-side apply)
- PR: _(to be linked)_

[AgDR-0006]: AgDR-0006-github-app-credential-storage.md
[AgDR-0029]: AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md
[AgDR-0031]: AgDR-0031-kubernetes-client-library.md
[AgDR-0032]: AgDR-0032-server-side-apply-deploy-mechanism.md
