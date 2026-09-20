# Where your apps run

By default Marsa lets Kubernetes decide which node runs each of your pods. **Node pinning** lets
you override that: "run this app on that box."

You pin an app from its settings — pick one or more nodes, then choose what should happen when
none of them is available:

| Choice                       | What it does                                                               |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Run somewhere else**       | Prefer the chosen nodes, but start the app anywhere rather than not at all |
| **Wait for a selected node** | Only ever run on the chosen nodes. If none is available the app waits.     |

Leaving the selection empty means "anywhere", which is the default for every app.

## When you actually need this

- **A node holds your data.** This is the big one. A volume lives on one node's disk, and it
  binds to whichever node the pod first lands on. If you care which disk your database ends up
  on, pin it _before_ the first deploy — moving it afterwards means destroying the volume.
- **A node has hardware the app needs** — more memory, faster disk, a GPU.
- **You want a noisy app kept off a box** that is doing something more important.

## What pinning does not do

This is the part worth reading twice, because the name suggests more than it delivers.

| You might expect                                     | Reality                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pinning to two nodes spreads my replicas across both | **No.** Pinning says where a pod _may_ run, never that pods must be spread. Both replicas can land on the same node.                                                                                               |
| More replicas means surviving a node failure         | **Not with a hard pin to one node.** All replicas run there, so losing it takes every one of them.                                                                                                                 |
| My app is kept away from my database                 | **Not as a rule.** It holds only while the pinned sets happen not to overlap — and an _unpinned_ app can be scheduled anywhere, including onto a database node.                                                    |
| Rolling back also restores the previous pin          | **No, deliberately.** A rollback restores the old image and settings, but keeps today's pin. If you re-pinned because a node died, a rollback that sent the app back to the dead node would make the outage worse. |
| A drain or upgrade won't interrupt a pinned app      | **Not yet.** Nothing currently stops every replica being moved at once during a node drain.                                                                                                                        |

The short version: **pinning controls placement, not availability.** Guaranteed spreading across
nodes and protection during drains are tracked in
[marsa-cloud/marsa#221](https://github.com/marsa-cloud/marsa/issues/221).

### Replicas on one pinned node

If you hard-pin an app to a single node and give it more than one replica, Marsa warns you in the
form. Those replicas give you more capacity to handle concurrent requests — they do **not** give
you resilience, because they share one machine's fate.

## Stateful apps live on one node, full stop

Marsa stores volumes with `local-path`: the data sits on one node's local disk. There is no
replication, so a database on Marsa today **cannot survive losing its node**, pinned or not.
Pinning makes the placement explicit and predictable; it does not make the data redundant.

Real answers to that are replicated storage or the database's own replication, and neither is
part of this release. Plan backups accordingly.

## Changing a pin

Editing an app's pin takes effect immediately — Marsa re-applies the running release onto the new
nodes. You do not need to deploy again.

Two consequences:

- Pods are rescheduled when you save, so expect a brief restart.
- If nothing is deployed yet, the pin is stored and used by the next deploy.
- If the cluster can't be reached, the save fails and the pin is **not** recorded. That is
  deliberate — a pin that was saved but never reached the cluster would leave the two disagreeing
  with nothing to tell you. Try again once the cluster is back.

## Pinning to something other than a node

Under the hood a pin matches a **node label**, and the picker fills in the built-in hostname
label for you. That is why the stored pin holds a label key rather than a node name — grouping
nodes into pools (`marsa.cc/pool=gpu`) needs no change to how pins are stored, only a way to set
those labels, which is not built yet.
