import { Module } from '@nestjs/common'
import { ViewNodeIndexController } from '#src/app/cluster/use-cases/view-node-index/view-node-index.controller.js'
import { ViewNodeIndexUseCase } from '#src/app/cluster/use-cases/view-node-index/view-node-index.use-case.js'

@Module({
  controllers: [ViewNodeIndexController],
  providers: [ViewNodeIndexUseCase],
})
export class ViewNodeIndexModule {}
