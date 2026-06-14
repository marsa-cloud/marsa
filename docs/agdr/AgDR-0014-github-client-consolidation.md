---
id: AgDR-0014
timestamp: 2026-06-11T16:30:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
ticket: marsa-cloud/marsa#59
---

# Consolidate per-feature GitHub services into one `GithubClient` behind an abstract class, mock-substituted by a NestJS factory in test/local

> In the context of the GitHub integration layer accreting one `@Injectable` per capability (`GitHubManifestClient` for #58, `GitHubInstallationTokenService` for #59), facing a PR #70 review note that a new service per client-facing feature scales poorly and is awkward to fake per-call, I decided to expose a **single `GithubClient` abstract class** with a real `OctokitGithubClient` implementation and a `MockGithubClient`, wired through a **NestJS factory provider** that returns the mock in test/local environments, to give consumers one stable injection seam and zero-network tests, accepting that one class now spans two GitHub concerns (manifest conversion + installation tokens).

## Context

`src/modules/github-client/` had two providers — `GitHubManifestClient` (one unauthenticated `fetch` to the manifest-conversion endpoint, #58) and `GitHubInstallationTokenService` (`@octokit/auth-app`, per-App auth cache, #59). Each consumer injected a different concrete class, and each test hand-rolled a different fake (a `createAppAuth` factory seam for one, a `globalThis.fetch` stub for the other). The PR #70 review asked for: (1) **one** `GithubClient` class rather than a service per feature, and (2) a **factory** that returns a mock implementation (e.g. `MockGithubClient`) so unit/e2e tests and local runs don't hit GitHub — ideally behind a single interface/abstract class.

## Options Considered

| Option                                                                                                                | Pros                                                                                                                                                                                    | Cons                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **(a) Abstract `GithubClient` + `OctokitGithubClient` (real) + `MockGithubClient`, factory-provided by env** (chosen) | One injection token for all GitHub ops; consumers depend on the abstract type; e2e/local get a network-free client for free; new GitHub ops are methods on one class, not new providers | One class spans two concerns; a factory branch on env                        |
| (b) Keep two services, add a mock for each                                                                            | Minimal change                                                                                                                                                                          | Doesn't address "one class"; two mocks to maintain; review note unaddressed  |
| (c) `GithubClient` facade delegating to the two existing services                                                     | One entry point                                                                                                                                                                         | Keeps the two providers it was meant to collapse; more indirection, not less |

## Decision

Chosen: **(a)**. An **abstract class `GithubClient`** (used as the DI token) declares `convertManifest(code)` and `getInstallationToken(params)`. `OctokitGithubClient extends GithubClient` carries the real logic — the manifest `fetch` plus the `@octokit/auth-app` mint, keeping the `@Optional() createAuth` seam so the real client is still unit-testable without GitHub. `MockGithubClient extends GithubClient` returns canned values and exposes a small factory (`createMockGithubClient(overrides)`) so a test can stub individual methods. `GitHubClientModule` provides `GithubClient` via `useFactory` that returns `MockGithubClient` when `NODE_ENV === 'test'` or the local mock flag is set, else `OctokitGithubClient`. Consumers (`ConvertManifestUseCase`, `CaptureInstallationUseCase`) inject `GithubClient` (the abstract type).

CodeRabbit finding D folds in here: the real client keys its auth cache by `githubAppId` **plus a `sha256(privateKeyPem)` fingerprint**, so a rotated PEM refreshes the cached auth instead of minting with the stale key.

This establishes a project convention — **each external client/service is exposed as one abstract class with a NestJS factory that returns a mock implementation in test/local** — captured in `apps/api/.claude/CLAUDE.md` and `handbooks/domain/marsa-api/external-client-factory-mock.md`. Supersedes the per-App-cache detail of [AgDR-0012](AgDR-0012-installation-token-strategy.md) (the strategy stands; the class that hosts it changes).

## Consequences

- `GitHubManifestClient` and `GitHubInstallationTokenService` are removed; their logic and tests merge into `OctokitGithubClient` + its test.
- Use-case unit tests inject `createStubInstance(GithubClient as never)` or `MockGithubClient`; e2e/local boot the mock automatically — no `fetch`/`createAppAuth` plumbing per test.
- Reserved files (`github-installation-token.service.ts` + test) are rewritten by this change; final personal review stays with the author.
- Types (`InstallationTokenParams`, `AppAuthFactory`) move to `github-client.types.ts` (PR #70 review #10).
- New GitHub capabilities (#60 clone, #61 webhooks) extend the one class rather than adding providers.

## Artifacts

- Ticket: marsa-cloud/marsa#59
- Builds on: [AgDR-0005](AgDR-0005-github-app-integration-model.md), [AgDR-0012](AgDR-0012-installation-token-strategy.md)
- PR: #70
