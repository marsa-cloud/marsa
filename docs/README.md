# Marsa docs

## Running Marsa

Installing on a VPS and adding nodes are covered in the [root README](../README.md).

| Page                           | What it covers                                           |
| ------------------------------ | -------------------------------------------------------- |
| [`hardening.md`](hardening.md) | Secrets encryption at rest, node-to-node encryption      |
| [`placement.md`](placement.md) | Pinning apps to nodes, and what pinning does not buy you |

## Working on Marsa

| Page                                     | What it covers                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| [`local-dev.md`](local-dev.md)           | No-cluster inner loop for UI work, and the k3d harness for real deploys |
| [`authentication.md`](authentication.md) | The two guards, the role model, and how to decorate a new route         |
| [`agdr/`](agdr/)                         | Agent Decision Records — why the architecture is the way it is          |
| [`specs/`](specs/)                       | Feature specs                                                           |
| [`plans/`](plans/)                       | Implementation plans                                                    |
