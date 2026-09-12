# Hardening

Marsa encrypts node-to-node traffic by default. Encryption of Kubernetes Secrets at rest is
**not** enabled by Marsa — it changes how K3s itself starts, so it is left to whoever owns
the cluster. This page covers both.

## Secrets encryption at rest

Marsa encrypts private-registry credentials with AES-256-GCM before storing them in
Postgres. To actually pull a private image, though, it has to hand those credentials to
Kubernetes as a `kubernetes.io/dockerconfigjson` Secret — and **Kubernetes Secrets are only
base64-encoded, not encrypted, in the cluster datastore**. `base64 -d` reverses that with no
key.

Where the datastore lives depends on your install:

- **Single-server (the default Marsa install)** — K3s's embedded **SQLite** database at
  `/var/lib/rancher/k3s/server/db/state.db`. Marsa's installer starts K3s without
  `--cluster-init` or an external datastore, so this is what you have unless you changed it.
- **Multi-server** — embedded etcd, under `/var/lib/rancher/k3s/server/db/etcd/`.

K3s can encrypt Secrets before they are written, via the server flag `--secrets-encryption`.
This works the same on either datastore, because the encryption happens at the API server,
above the datastore. Check any cluster with `sudo k3s secrets-encrypt status`.

### What enabling it would and would not cover

This is worth being precise about, because "encryption at rest" invites the assumption that
it covers everything, and it does not.

**It would encrypt:**

- **Kubernetes Secret objects written after it is turned on** — including the
  `<slug>-registry` pull Secret Marsa materializes for each private-image app.
- **Datastore-only artifacts**, which is where it earns its keep. An etcd snapshot
  (`k3s etcd-snapshot`), a copy of `state.db`, or a backup agent scoped to the database
  file contains the datastore and _not_ the encryption key, so it is ciphertext to anyone
  who obtains it. This is the common leak shape — snapshots shipped to object storage on a
  cron, sitting in a bucket someone later misconfigures.

**It would not encrypt, or would not help with:**

- **Secrets already written before you turned it on.** Enabling only affects subsequent
  writes. Existing rows stay readable until a key rotation rewrites them — see
  [enabling on an existing cluster](#enabling-it-on-an-existing-cluster).
- **Whole-node disk images.** The key file lives on the same disk as the datastore (see
  [below](#the-key-lives-on-the-same-node)), so a VPS provider snapshot or a stolen drive
  captures both and the scheme collapses. If provider snapshots _are_ your backup strategy,
  this flag on its own buys you very little.
- **Anyone who can run `kubectl get secret`.** The API server decrypts transparently for
  authorized callers, exactly as designed. This is a data-at-rest control, not an access
  control — who holds a kubeconfig is a separate problem.
- **Credentials anywhere other than the datastore.** The Postgres copy is already covered by
  Marsa's own AES-256-GCM. Environment variables inside running pods, values baked into
  image layers, and anything written to logs are all untouched by this flag.

### Enabling it on a fresh install

Marsa's installer runs `k3s` for you and does not pass `--secrets-encryption`, so there is
no flag to set on the Marsa side. Two ways around that:

- **Install K3s yourself first**, with `--secrets-encryption`, then point the Marsa
  installer at it with `--skip-k3s` (it will use your `$KUBECONFIG` instead of provisioning
  a cluster).
- **Install Marsa normally, then follow the existing-cluster procedure below.** Simpler, at
  the cost of a short window where Secrets are written unencrypted — and a mandatory key
  rotation afterwards to rewrite them.

### Enabling it on an existing cluster

Re-running the Marsa installer will **not** enable encryption on a cluster that is already
up: it sees a running K3s and skips that step entirely. Enabling on a live cluster is K3s's
own six-step procedure, with **two restarts**, and the ordering matters:

1. Confirm the current state: `sudo k3s secrets-encrypt status`.
2. `sudo k3s secrets-encrypt enable` — **once, on a single server**, even in a multi-server
   cluster. Running it on several servers is how you end up with mismatched hashes.
3. Add `--secrets-encryption` to `ExecStart` in `/etc/systemd/system/k3s.service` (or set
   `secrets-encryption: true` in `/etc/rancher/k3s/config.yaml`) on **every** server.
4. `sudo systemctl daemon-reload && sudo systemctl restart k3s` on every server. `status`
   now reports encryption disabled at the `start` stage — that is expected, not a failure.
5. `sudo k3s secrets-encrypt rotate-keys` — again once, on a single server.
6. Restart every server again. `status` should now report `Enabled` with rotation stage
   `reencrypt_finished`.

Step 5 is the one that rewrites what is already stored. Without it you have encryption
covering future writes only, and the registry credentials that made you read this page stay
in the clear.

> `k3s secrets-encrypt enable` on an existing cluster needs a March 2026 or later K3s
> (v1.33.10+k3s1, v1.34.6+k3s1, v1.35.3+k3s1). On anything older, a rebuild is the
> realistic path.

### The key lives on the same node

K3s writes the encryption key to `/var/lib/rancher/k3s/server/cred/encryption-config.json`
on the server. It is not derived from a passphrase and is not stored anywhere else, so **a
backup or disk image capturing both the datastore and that file is as good as an
unencrypted one.** The protection above only holds where the two are separated.

- **Back them up through separate paths**, with different access control. Datastore backups
  and key material should not travel together.
- **Treat the file as key material.** Restrict it to root, keep it out of
  config-management repos, support bundles, and log archives. Losing it means losing every
  Secret in the cluster; leaking it means the encryption never happened.

K3s manages this file itself — do not hand-edit it. Multi-server clusters need the _same_
file on every server.

### Key rotation

Rotation is yours to schedule; nothing rotates by itself. On v1.30+ it is a single
`sudo k3s secrets-encrypt rotate-keys` followed by a restart of every server — the older
`prepare` → `rotate` → `reencrypt` sequence is legacy and K3s no longer recommends it. Full
reference, including the `--secrets-encryption-provider` choice between `aescbc` and
`secretbox`: [K3s secrets encryption](https://docs.k3s.io/security/secrets-encryption).

## Node-to-node encryption

Traffic between nodes is encrypted. K3s defaults flannel to plaintext VXLAN; Marsa
overrides that, installing K3s with `--flannel-backend=wireguard-native` so the pod/service
overlay is carried over WireGuard instead. Marsa exposes no flag to change the backend — it
is fixed for every Marsa cluster (see
[AgDR-0041](agdr/AgDR-0041-node-to-node-encryption-flannel-wireguard.md)).

Two consequences for operators:

- **Open UDP 51820 and TCP 6443 between nodes.** WireGuard replaces VXLAN's UDP 8472, so a
  firewall that only allows 8472 leaves a joining node stuck short of `Ready`. TCP 6443
  (agent → server) is what the node registers over in the first place; without it the join
  never starts. On a dual-stack cluster WireGuard also uses UDP 51821 for IPv6 — Marsa does
  not configure IPv6 today, so this only matters if you have set it up yourself.
- **Every node needs in-kernel WireGuard.** Kernel 5.6+ has it built in; on older or
  minimal cloud images, `sudo apt-get install -y wireguard` (and sometimes
  `linux-modules-extra-$(uname -r)`) provides it. The installer checks for this in
  pre-flight and refuses to run without it, on both the server and agent paths.

Single-node installs are unaffected in practice — there is no second node to talk to — but
the same kernel requirement applies, since adding a node later must just work.

This covers **L3 node interconnection** only. Pod-to-pod / service-mesh mTLS is tracked in
[#24](https://github.com/marsa-cloud/marsa/issues/24), and edge TLS from clients to the
ingress is handled by the chart (see
[marsa-charts#19](https://github.com/marsa-cloud/marsa-charts/issues/19)).
