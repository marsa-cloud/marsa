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
curl -fsSL https://get.marsa.cc | bash -s -- --domain marsa.example.com --email you@example.com
```

Point both `marsa.example.com` and `api.marsa.example.com` (or `*.marsa.example.com`)
at the server's public IP first, so the HTTPS certificate can be issued. Re-running
the same command updates an existing install.

## Adding More Nodes

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

### Node-to-node encryption

Traffic between nodes is encrypted. Marsa installs K3s with flannel's
`wireguard-native` backend, so the pod/service overlay is carried over WireGuard
instead of plaintext VXLAN. This is on by default and has no configuration flag.

Two consequences for operators:

- **Open UDP 51820 between nodes.** WireGuard replaces VXLAN's UDP 8472. A firewall
  that only allows 8472 will leave a joining node stuck short of `Ready`.
- **Every node needs in-kernel WireGuard.** Kernel 5.6+ has it built in; on older or
  minimal cloud images, `sudo apt-get install -y wireguard` (and sometimes
  `linux-modules-extra-$(uname -r)`) provides it. The installer checks for this in
  pre-flight and refuses to run without it, on both the server and agent paths.

Single-node installs are unaffected in practice — there is no second node to talk to —
but the same kernel requirement applies, since adding a node later must just work.

This covers **L3 node interconnection** only. Pod-to-pod / service-mesh mTLS is tracked
in [#24](https://github.com/marsa-cloud/marsa/issues/24), and edge TLS from clients to
the ingress is handled by the chart (see
[marsa-charts#19](https://github.com/marsa-cloud/marsa-charts/issues/19)).

## Local development

See [`docs/local-dev.md`](docs/local-dev.md) — a fast no-cluster inner loop for UI work, and a `pnpm e2e:up` / `pnpm e2e:test` k3d harness for real deploys over HTTPS.

## Current Status

Early prototype / MVP phase.

Features, APIs, and architecture may change frequently.
