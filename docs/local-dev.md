# Local development

Two tiers, depending on whether you need a real Kubernetes cluster.

## Fast inner loop — no cluster

Click through the web UI without k3d/k3s and without real GitHub login. The api
runs in test mode, which wires the network-free mock runtime adapter + mock
GitHub client, and `seed-dev` mints a login cookie.

```bash
docker compose up -d                       # Postgres (marsa_test)
cp apps/api/.env.test apps/api/.env        # NODE_ENV=test → mock backends, MARSA_RUNTIME=mock
pnpm --filter api build
pnpm seed                                  # seed an operator + sample apps, print a session cookie
pnpm dev                                   # api + web together
```

Paste the printed `marsa_session=…` cookie into the browser (DevTools →
Application → Cookies) for the web origin and reload. Deploys on this tier are
**faked** — the mock runtime adapter applies nothing to a cluster. To exercise a real
deploy over a real domain, use the E2E tier below.

## With-cluster E2E — real deploy over HTTPS

Spin a disposable k3d cluster, install Marsa via the real installer path, deploy
a sample app through the API, and assert it is reachable over HTTPS.

```bash
pnpm e2e:up         # create k3d + install Marsa (install.sh --skip-k3s)
pnpm e2e:test       # seed, deploy a sample app through the API, assert HTTPS
pnpm e2e:down       # tear the cluster down
```

Provisioning and assertions are separate scripts on purpose: `e2e:test` runs
against _any_ installed Marsa, which is exactly how CI reuses it after its own
real-K3s install. Re-run `pnpm e2e:test` as often as you like against one
cluster.

The app is served at `<slug>.127.0.0.1.nip.io` with Traefik's default
self-signed cert (the assertion uses `curl -k`). Override the cluster name or
base domain with `MARSA_E2E_CLUSTER` / `MARSA_E2E_DOMAIN`, and the host ports
with `MARSA_E2E_HTTP_PORT` / `MARSA_E2E_HTTPS_PORT` when something already holds
`:80` / `:443`.

### Reaching a database

Databases are in-cluster only — nothing is exposed outside the cluster in v0.2 (#233 adds
external access). To open a psql shell against one on a k3d install:

```bash
kubectl -n <project>-<environment> exec -it <slug>-0 -- psql -U postgres -d <slug_with_underscores>
```

An app receives a database's connection variables by **attachment**, not by copying: attach one
from the app's page and its pods get `DATABASE_URL` and the `PG*` variables as references to the
database's Secret. A second database on the same app needs an alias, which prefixes its variables
(`ANALYTICS_DATABASE_URL`). Detaching removes them and restarts the app. A database an app is
still attached to cannot be deleted — the 409 names the apps to detach it from first.

Two things the UI also says, worth repeating here: the requested storage size is **recorded but
not enforced** — the default `local-path` class ignores capacity and cannot resize — and the data
lives on whichever node the pod first landed on, so moving it means a dump and restore (#209).
Point the volumes at another storage class with `MARSA_DATABASE_STORAGE_CLASS` (default
`local-path`) **before** creating anything; a volume cannot change class in place.

### Clicking through your own branch

`e2e:up` installs whatever image tag the chart resolves — by default the
**published** one, not your working tree. The chart is pulled from OCI and the
installer only accepts a tag, so there is no build-and-load-local path. To click
through a branch, have CD publish an image for it:

```bash
gh pr edit <pr> --add-label preview          # cd.yml is label-gated for PRs

# The tag is the sha of the PR's MERGE commit, not your head commit — read it:
gh run view <run-id> --log \
  | grep -oE 'ghcr.io/marsa-cloud/marsa-(api|web):sha-[a-f0-9]+' | sort -u

MARSA_E2E_HTTP_PORT=8080 bash scripts/e2e-up.sh --image-tag sha-<short>
export KUBECONFIG="$(k3d kubeconfig write marsa-e2e)"
```

A throwaway cluster has no GitHub App configured, so mint a session cookie from
inside the api pod instead of logging in:

```bash
pod=$(kubectl -n marsa get pod -l app=marsa-api -o jsonpath='{.items[0].metadata.name}')
kubectl -n marsa exec "$pod" -- node dist/src/entrypoints/seed-dev.js --user-only
```

Open `https://127.0.0.1.nip.io/`, accept the self-signed cert, paste the cookie
for that origin, reload. The web's `apiBase` is the relative `/api` and Traefik
routes it on the web host, so one cookie on the web origin covers the API too.

The same harness runs in CI on `workflow_run` after `CD` completes
(`.github/workflows/e2e.yml`), there against a **full real-K3s** `install.sh`
using the CD-built `sha-<short>` image — so one job proves both that the
installer works and that a real deploy reaches HTTPS. Design: `docs/superpowers/specs/2026-07-14-least-mocks-e2e-harness-design.md`.

## Troubleshooting

**Creating an environment keeps failing with 409 "already taken".** A previous attempt
provisioned the namespace, then its database commit failed, so the namespace is labelled with an
environment uuid no row has. Check that no environment row uses the uuid in the namespace's
`marsa.cloud/environment-uuid` label, then `kubectl delete ns <project>-<environment>` and retry.
This is the one gap the transaction rule accepts — see AgDR-0047.
