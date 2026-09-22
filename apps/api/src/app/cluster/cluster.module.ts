import { Module } from '@nestjs/common'
import { ViewNodeIndexModule } from '#src/app/cluster/use-cases/view-node-index/view-node-index.module.js'

@Module({
  imports: [ViewNodeIndexModule],
})
export class ClusterModule {}
