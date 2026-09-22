import { Injectable } from '@nestjs/common'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'
import type { ClusterNode } from '#src/modules/runtime/runtime.types.js'

// Fixed inventory so the cluster-free local loop (seed-dev) can still render the node picker.
const NODES: ClusterNode[] = [
  { name: 'mock-node-a', labels: { 'kubernetes.io/hostname': 'mock-node-a' }, ready: true },
  { name: 'mock-node-b', labels: { 'kubernetes.io/hostname': 'mock-node-b' }, ready: false },
]

@Injectable()
export class MockNodeRuntime extends NodeRuntime {
  listNodes(): Promise<ClusterNode[]> {
    return Promise.resolve(NODES)
  }
}
