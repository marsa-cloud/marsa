import { ApiProperty } from '@nestjs/swagger'
import type { ClusterNode } from '#src/modules/runtime/runtime.types.js'

export class NodeSummary {
  @ApiProperty({ type: String, example: 'node-a' })
  readonly name: string

  @ApiProperty({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { 'kubernetes.io/hostname': 'node-a' },
    description: 'Every label on the node; pin against any of these keys.',
  })
  readonly labels: Record<string, string>

  @ApiProperty({ type: Boolean, example: true })
  readonly ready: boolean

  constructor(node: ClusterNode) {
    this.name = node.name
    this.labels = node.labels
    this.ready = node.ready
  }
}

// Not paginated: a cluster has a handful of nodes and there is no cursor to seek on.
export class ViewNodeIndexResponse {
  @ApiProperty({ type: [NodeSummary] })
  readonly items: NodeSummary[]

  constructor(nodes: ClusterNode[]) {
    this.items = nodes.map((node) => new NodeSummary(node))
  }
}
