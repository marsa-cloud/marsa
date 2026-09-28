---
id: AgDR-0049
timestamp: 2026-09-23T00:00:00Z
agent: claude
model: claude-opus-5-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#21
---

# In-cluster builds: Dockerfile-first, rootless BuildKit Jobs from a pinned git context

> In the context of building an operator's repo inside the cluster (#21, v0.2 Goal 2), facing Kaniko's archival and a build that must fetch private code and push to the in-cluster registry, I decided on **one rootless BuildKit Job per build in a dedicated `marsa-builds` namespace, fed a git context pinned to the commit with the installation token as a BuildKit secret, Dockerfile-first**, to achieve builds with no Docker daemon, no clone step in Marsa and no token in any manifest, accepting relaxed seccomp/AppArmor for build pods and no buildpack support yet.

## Context

A build must: fetch the repo at a commit (private repos through the GitHub App's installation
token), build the Dockerfile under a root directory (monorepos), push to Zot (AgDR-0048) and report
a readable failure. Kaniko, the usual daemonless builder, was archived by Google on 2025-06-03.
Rootless BuildKit needs `Unconfined` seccomp and AppArmor, which must not leak into environment
namespaces (#219 plans Pod Security Standards there).

## Options Considered

| Option                                          | Pros                                                                                               | Cons                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Rootless BuildKit Job per build (chosen)**    | Maintained; daemonless via `buildctl-daemonless.sh`; git context + secrets built in; no clone code | Needs `Unconfined` profiles; one pod per build pays BuildKit startup                   |
| Kaniko / Chainguard's fork                      | Unprivileged without profile changes                                                               | Upstream archived; fork has no feature development                                     |
| Long-lived `buildkitd` Deployment + client Jobs | Warm cache across builds                                                                           | A standing privileged-ish daemon; cache/disk management; more moving parts than needed |
| Buildpacks (Railpack / Paketo) first            | No Dockerfile needed                                                                               | Large surface; the spec keeps it for later — nothing here blocks adding it             |

## Decision

Chosen: **rootless BuildKit Jobs**, verified on k3d with `moby/buildkit:v0.33.0-rootless`:

- Context `https://github.com/<repo>.git#<sha>:<rootDir>` (root dir omitted for `.`), `--opt=filename=<dockerfilePath>`.
- Token passed as `--secret=id=GIT_AUTH_TOKEN.github.com,env=GIT_TOKEN`, read from a per-build
  Secret owned by the Job (garbage-collected with it). The spike showed the token is sent: a bad
  one broke a clone of a public repo.
- Output `type=image,name=<in-cluster push ref>,push=true,registry.insecure=true` with
  `DOCKER_CONFIG` mounted from the chart's `marsa-registry-push` Secret.
- `backoffLimit: 0`, `activeDeadlineSeconds: 1800`, `ttlSecondsAfterFinished: 3600` (log
  retention for #116), `terminationMessagePolicy: FallbackToLogsOnError` so the BuildKit error
  line becomes the build's failure reason.
- Jobs run in `marsa-builds`; the api gets a namespaced Role there (jobs, secrets, pods, logs).

## Consequences

- A repo without a Dockerfile fails with BuildKit's own message; buildpacks are a follow-up.
- No build cache between builds (spec non-goal); every build re-pulls base images.
- Build pods set no CPU/memory requests or limits yet, so a heavy build can crowd its node; sizing
  them (and making them tunable) is a follow-up.
- A private-repo build with a real installation token is verified only by manual QA.

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md` §2
- Plan: `docs/superpowers/plans/2026-09-23-phase-c-part-1-build-engine.md`
- PRs: marsa-cloud/marsa#237, marsa-cloud/marsa-charts#32
