import type { ClusterNode } from '#src/modules/runtime/runtime.types.js'

export abstract class NodeRuntime {
  // The runtime is the only source of truth for membership; nothing is stored.
  abstract listNodes(): Promise<ClusterNode[]>
}
