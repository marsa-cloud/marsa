import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { App } from '#src/app/app-management/entities/app.entity.js'
import { Release } from '#src/app/release/entities/release.entity.js'
import { ViewReleaseIndexController } from '#src/app/release/use-cases/view-release-index/view-release-index.controller.js'
import { ViewReleaseIndexRepository } from '#src/app/release/use-cases/view-release-index/view-release-index.repository.js'
import { ViewReleaseIndexUseCase } from '#src/app/release/use-cases/view-release-index/view-release-index.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule, MikroOrmModule.forFeature([App, Release])],
  controllers: [ViewReleaseIndexController],
  providers: [ViewReleaseIndexUseCase, ViewReleaseIndexRepository],
})
export class ViewReleaseIndexModule {}
