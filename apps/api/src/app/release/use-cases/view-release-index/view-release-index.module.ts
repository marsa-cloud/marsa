import { Module } from '@nestjs/common'
import { ViewReleaseIndexController } from '#src/app/release/use-cases/view-release-index/view-release-index.controller.js'
import { ViewReleaseIndexRepository } from '#src/app/release/use-cases/view-release-index/view-release-index.repository.js'
import { ViewReleaseIndexUseCase } from '#src/app/release/use-cases/view-release-index/view-release-index.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [ViewReleaseIndexController],
  providers: [ViewReleaseIndexUseCase, ViewReleaseIndexRepository],
})
export class ViewReleaseIndexModule {}
