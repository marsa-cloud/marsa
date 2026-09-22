import { CoreV1Api, KubeConfig, type V1Node } from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'
import type { ClusterNode } from '#src/modules/runtime/runtime.types.js'

export function toClusterNodes(nodes: V1Node[]): ClusterNode[] {
  return nodes
    .filter((node) => node.metadata?.name)
    .map((node) => ({
      name: node.metadata?.name ?? '',
      labels: node.metadata?.labels ?? {},
      ready:
        node.status?.conditions?.some(
          (condition) => condition.type === 'Ready' && condition.status === 'True',
        ) ?? false,
    }))
}

@Injectable()
export class KubernetesNodeRuntime extends NodeRuntime {
  private readonly core: CoreV1Api

  constructor() {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.core = kc.makeApiClient(CoreV1Api)
  }

  async listNodes(): Promise<ClusterNode[]> {
    const { items } = await this.core.listNode()
    return toClusterNodes(items)
  }
}
