export interface ClusterNode {
  name: string
  labels: Record<string, string>
  ready: boolean
}

export abstract class NodeBackend {
  // The cluster is the only source of truth for membership; nothing is stored.
  abstract listNodes(): Promise<ClusterNode[]>
}
