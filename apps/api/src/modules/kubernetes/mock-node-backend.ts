import { Injectable } from '@nestjs/common'
import { type ClusterNode, NodeBackend } from '#src/modules/kubernetes/node-backend.js'

// Fixed inventory so the cluster-free local loop (seed-dev) can still render the node picker.
const NODES: ClusterNode[] = [
  { name: 'mock-node-a', labels: { 'kubernetes.io/hostname': 'mock-node-a' }, ready: true },
  { name: 'mock-node-b', labels: { 'kubernetes.io/hostname': 'mock-node-b' }, ready: false },
]

@Injectable()
export class MockNodeBackend extends NodeBackend {
  listNodes(): Promise<ClusterNode[]> {
    return Promise.resolve(NODES)
  }
}
