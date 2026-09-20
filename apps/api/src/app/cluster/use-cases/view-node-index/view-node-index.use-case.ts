import { Injectable } from '@nestjs/common'
import { ViewNodeIndexResponse } from '#src/app/cluster/use-cases/view-node-index/view-node-index.response.js'
import { NodeBackend } from '#src/modules/kubernetes/node-backend.js'

@Injectable()
export class ViewNodeIndexUseCase {
  constructor(private readonly nodes: NodeBackend) {}

  async execute(): Promise<ViewNodeIndexResponse> {
    return new ViewNodeIndexResponse(await this.nodes.listNodes())
  }
}
