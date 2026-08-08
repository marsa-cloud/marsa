# Node-to-node encryption via flannel `wireguard-native`

> In the context of a multi-node K3s cluster provisioned by `scripts/install.sh`, facing a
> pod/service data plane that travels between nodes as plaintext VXLAN, I decided to install
> K3s with `--flannel-backend=wireguard-native`, always on and with no opt-out flag, and to
> hard-fail pre-flight when the WireGuard kernel module is absent, to achieve encrypted
> node-to-node traffic by default, accepting a hard kernel dependency on every node, a new
> UDP 51820 firewall requirement, and a slightly smaller pod MTU.

## Context

AgDR-0003 stood up the VPS installer and explicitly deferred inter-node encryption to #24,
documenting the gap with a "keep nodes on a private network" warning instead. That warning
is the weakest part of the installer's security posture: operators routinely join nodes
across networks they don't fully control (a second VPS at the same provider, a machine in
another rack), and the K3s control plane being TLS gives a false sense that the _data_ plane
is too. It isn't — flannel's default VXLAN backend carries pod and service traffic in the
clear.

#141 carves the MVP-achievable slice out of #24: **L3 node interconnection encryption**,
native to K3s, no service mesh. Everything above that layer (pod-to-pod / service mTLS)
stays with #24; edge TLS from clients to the ingress stays with marsa-charts#19.

Two facts shaped the design:

1. `--flannel-backend` is a **server-only** K3s flag. Agents inherit the backend from the
   server and have no matching flag to set. The issue's acceptance criteria assumed both
   paths take a flag; they don't.
2. `wireguard-native` requires the **in-kernel** WireGuard module on every node — server and
   agent alike — per the K3s networking docs. It needs no userspace `wg` tooling.

## Options Considered

| Option                                          | Pros                                                                                         | Cons                                                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`wireguard-native` flannel backend** (chosen) | In-kernel, no extra components, one K3s flag, transparent to workloads, ~free on kernel 5.6+ | Hard kernel dependency on every node; new UDP 51820 requirement; smaller pod MTU                                                                                  |
| Tailscale integration (`--vpn-auth`)            | Handles NAT traversal, works across untrusted networks, key management done for you          | Third-party SaaS dependency + account in the install path, contradicts self-hostable-with-no-lock-in; overkill for the MVP's "nodes on a shared network" topology |
| `ipsec` flannel backend                         | Also encrypts node-to-node                                                                   | Deprecated in K3s and scheduled for removal — a dead end                                                                                                          |
| Service mesh (linkerd / cilium mTLS)            | Encrypts pod-to-pod, richer policy                                                           | Whole new control plane to install, operate, and upgrade; solves a layer above what #141 asks for; belongs to #24                                                 |
| Keep VXLAN, document the risk (status quo)      | Zero work, zero new failure modes                                                            | The risk doesn't go away because it's documented; leaves the plaintext default in place for every operator who doesn't read the warning                           |

Two further axes were settled explicitly with the operator:

**Hard-fail vs warn on a missing WireGuard module.** Chosen: **hard-fail**. A warn-and-continue
path produces the worst outcome available — the operator reads "encrypted node-to-node
traffic" in the docs and the summary, while the cluster either fails to form for reasons
they must debug from K3s logs, or silently isn't doing what they think. Failing in pre-flight
with a remediation list turns that into a thirty-second fix.

**Fixed vs a `--flannel-backend` escape hatch.** Chosen: **fixed, no flag**. An opt-out is a
knob nobody sets deliberately and everybody sets accidentally when an install fails; it
would also need its own test matrix and would weaken "encrypted by default" to "encrypted
unless someone was in a hurry". Operators who genuinely need a different CNI already have
`--skip-k3s` and can bring their own cluster.

## Decision

Chosen: **`wireguard-native`, always on, with a hard-failing pre-flight check.**

Concretely, in `scripts/install.sh`:

- The server install becomes
  `curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --flannel-backend=wireguard-native" sh -`.
- The agent join is **unchanged** — no flag exists for it; it inherits the backend. Its side
  of the contract is the kernel module and UDP 51820 reachability.
- `preflight()` gains `require_wireguard()`, which accepts either `/sys/module/wireguard`
  (built-in or already loaded) or a successful `modprobe wireguard`, and otherwise dies with
  the remediation steps. It runs on both server and agent paths.
- `--skip-k3s` **skips** the check: that path installs into a cluster whose CNI someone else
  already chose, so neither the flag nor the module requirement is ours to enforce.
- Both install summaries and the README now state that node traffic is encrypted and call
  out UDP 51820 explicitly, replacing AgDR-0003's "not encrypted by default" warning.

## Consequences

- Node-to-node pod/service traffic is encrypted by default on every new multi-node install.
  No operator action, no configuration.
- **New firewall requirement: UDP 51820** between nodes, replacing VXLAN's UDP 8472. This is
  the most likely failure mode in the field and is called out in the summary, the README, and
  the pre-flight failure text.
- **New kernel requirement** on every node. Kernel 5.6+ ships WireGuard built in, which
  covers current Debian/Ubuntu — the only OSes the installer supports — so in practice this
  bites only minimal or unusually old cloud images.
- **Pod MTU drops** by the WireGuard overhead (~60 bytes vs VXLAN's ~50). K3s computes the
  flannel MTU from the backend automatically, so nothing needs to be set by hand; workloads
  that hardcode an MTU or rely on large-packet paths could notice.
- **Existing single-node installs are unaffected** until a second node is added — there is no
  peer to encrypt to. The re-run path does not migrate an installed cluster's backend; an
  operator wanting encryption on an already-installed cluster reinstalls K3s.
- This **supersedes the deferral bullet in AgDR-0003** ("Inter-node encryption deferred to
  #24"). #24 keeps the layer above: pod-to-pod / service-mesh L4/L7.
- #55 (CI coverage for `scripts/install.sh`) inherits a new surface to cover: the pre-flight
  branch and the composed `INSTALL_K3S_EXEC` string.

## Artifacts

- Issue: marsa-cloud/marsa#141
- File: `scripts/install.sh`, `README.md`
- Supersedes: AgDR-0003 § "Inter-node encryption deferred to #24"
- Related: marsa-cloud/marsa#24 (pod-to-pod / service mesh, still deferred);
  marsa-charts#19 (edge TLS); marsa-cloud/marsa#125 (etcd encryption at rest);
  marsa-cloud/marsa#55 (installer CI coverage)
- Upstream docs: K3s networking options (flannel backends), K3s installation requirements
  (UDP 51820 for the WireGuard backend)
