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
curl -fsSL https://get.marsa.gomaa.ovh | bash -s -- --domain marsa.example.com --email you@example.com
```

Point both `marsa.example.com` and `api.marsa.example.com` (or `*.marsa.example.com`)
at the server's public IP first, so the HTTPS certificate can be issued. Re-running
the same command updates an existing install.

## Current Status

Early prototype / MVP phase.

Features, APIs, and architecture may change frequently.
