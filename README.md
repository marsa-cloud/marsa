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

On a fresh Debian/Ubuntu server, the bundled installer provisions K3s + Helm and
deploys Marsa from its Helm chart with HTTPS via Let's Encrypt:

```bash
sudo ./scripts/install.sh --domain marsa.example.com --email you@example.com
```

Point both `marsa.example.com` and `api.marsa.example.com` (or `*.marsa.example.com`)
at the server's public IP first, so the certificate challenge can complete. Re-running
the script with the same arguments updates an existing install. See
`scripts/install.sh --help` for all options.

## Current Status

Early prototype / MVP phase.

Features, APIs, and architecture may change frequently.
