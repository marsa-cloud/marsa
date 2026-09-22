---
id: AgDR-0047
timestamp: 2026-09-22T00:00:00Z
agent: claude
model: claude-opus-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#214
---

# Transactions wrap runtime calls, runtime call last

> In the context of use-cases that write rows and call the runtime, facing two opposite orderings in the codebase and #214's "no cluster call inside a transaction", I decided **one transaction per writing use-case with the runtime call last, rolling back on failure**, to achieve one simple rule every new use-case copies, accepting that a commit failing after a successful runtime call leaves the two out of step.

## Context

Two orderings coexisted. `create-environment` / `delete-environment` called the cluster inside a
transaction; `update-app` (#222) called the cluster first and wrote after, with no transaction,
because writing first had made a retry a no-op. `create-release`, `deploy-release` and
`delete-app` read, decided and wrote with no transaction at all (#214), and at Postgres's READ
COMMITTED a plain read inside a transaction would not have locked anything anyway. #205–#207
are about to add more use-cases that both write rows and call the runtime; each would copy
whichever shape sat nearest.

## Options Considered

| Option                                                 | Pros                                                                                                                      | Cons                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Transaction, runtime call last (chosen)                | One rule; DB constraint failures surface before side effects; a runtime failure rolls back, so retries see the same state | A DB connection is held across the runtime call; a commit failing after a successful runtime call is not handled |
| Runtime call first, DB write after, no transaction     | Retryable by construction                                                                                                 | Needs per-use-case reasoning about what "first" means; reads still race                                          |
| No runtime call inside a transaction (#214 as written) | Short transactions                                                                                                        | Forces compensating actions or cluster-first ordering everywhere; more code                                      |
| `transaction(fn)` on every repository                  | Use-cases stay free of `Database`                                                                                         | Boilerplate per repository for a one-line pass-through                                                           |
| Ambient ALS transactions (#171)                        | No `tx` threading                                                                                                         | New dependency and a codebase-wide change; not needed for correctness                                            |

## Decision

Chosen: **transaction with the runtime call last**.

- A writing use-case opens one `db.transaction`: deciding reads, then DB writes, then the runtime
  call. A runtime failure throws and rolls back. Runtime calls are idempotent.
- A use-case may inject `Database` only to call `db.transaction`; repositories take the `tx` as
  an `Executor`.
- Reads that decide a write lock with `FOR UPDATE OF <table>`. One job per repository method.
- A write that must survive the rollback — `deploy-release` recording `Failed` — runs after the
  transaction, on its own.

## Consequences

- A connection is held for the duration of a runtime call. Acceptable at Marsa's scale.
- `create-environment` keeps its compensating `destroy`: a partial provision (namespace created,
  RoleBinding failed) would otherwise leave a namespace labelled with a uuid no row will ever have.
- Accepted gap: if the runtime call succeeds and the commit fails, `update-app`, `deploy-release`
  and `delete-app` converge on retry; `create-environment` does not — its retry mints a new uuid
  and 409s against the orphan. Manual fix in `docs/local-dev.md` § Troubleshooting.
- #171 becomes an optional, mechanical swap of how `tx` is passed; no correctness work waits on it.

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-22-runtime-port-and-transactions-design.md`
- Plan: `docs/superpowers/plans/2026-09-22-transactions-wrap-runtime-calls.md`
- Ticket: [marsa-cloud/marsa#214](https://github.com/marsa-cloud/marsa/issues/214)
- Related: [marsa-cloud/marsa#171](https://github.com/marsa-cloud/marsa/issues/171), AgDR-0046
