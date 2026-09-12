# Marsa

Marsa is an open-source, self-hostable Platform as a Service (PaaS) inspired by platforms like Heroku and Railway.

It lets you deploy and manage applications on your own infrastructure using Kubernetes (K3s).

> [!WARNING]
> Marsa is under active development and is not ready for production use yet.

## Goals

- Open-source core
- Self-hostable
- No vendor lock-in
- Simple developer experience
- Kubernetes-based runtime (K3s)

## Install on a VPS

On a fresh Debian/Ubuntu server, one command installs Marsa and serves it over HTTPS:

```bash
curl -fsSL https://get.marsa.cc | sudo bash -s -- --domain marsa.example.com --email you@example.com
```

Point both `marsa.example.com` and `api.marsa.example.com` (or `*.marsa.example.com`)
at the server's public IP first, so the HTTPS certificate can be issued. Re-running
the same command updates an existing install.

## Adding more nodes

To grow the cluster (e.g. to run your database on a separate server from the backend),
join more worker nodes with the same installer in `--agent` mode. Run this on each new
machine:

```bash
curl -fsSL https://get.marsa.cc \
  | sudo bash -s -- --agent --server-url https://<private-ip>:6443 --token <node-token>
```

- `<private-ip>` — the original server's address on the private network the nodes share.
- `<node-token>` — read from `/var/lib/rancher/k3s/server/node-token` on the server. The
  server's install summary prints this command with the token already filled in.

Verify the node joined by running `sudo k3s kubectl get nodes` on the server.

Joining a node has firewall and kernel prerequisites, because the overlay runs over
WireGuard — see [`docs/hardening.md`](docs/hardening.md#node-to-node-encryption).

## Hardening

Node-to-node traffic is encrypted by default. Kubernetes Secrets — including the registry
credentials Marsa materializes to pull private images — are **not** encrypted in the cluster
datastore unless you enable that on K3s yourself.

What each covers, what neither covers, and how to turn on Secrets encryption:
[`docs/hardening.md`](docs/hardening.md).

## Local development

See [`docs/local-dev.md`](docs/local-dev.md) — a fast no-cluster inner loop for UI work, and a `pnpm e2e:up` / `pnpm e2e:test` k3d harness for real deploys over HTTPS.

## Documentation

[`docs/`](docs/README.md) — hardening, local development, and the decision records behind the architecture.

## Current Status

Early prototype / MVP phase.

Features, APIs, and architecture may change frequently.
