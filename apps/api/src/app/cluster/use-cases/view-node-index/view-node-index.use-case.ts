import { Injectable } from '@nestjs/common'
import { ViewNodeIndexResponse } from '#src/app/cluster/use-cases/view-node-index/view-node-index.response.js'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'

@Injectable()
export class ViewNodeIndexUseCase {
  constructor(private readonly nodes: NodeRuntime) {}

  async execute(): Promise<ViewNodeIndexResponse> {
    const nodes = await this.nodes.listNodes()
    return new ViewNodeIndexResponse(nodes)
  }
}
