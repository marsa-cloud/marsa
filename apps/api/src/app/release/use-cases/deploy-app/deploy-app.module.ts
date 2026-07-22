import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { App } from '#src/app/app-management/entities/app.entity.js'
import { Release } from '#src/app/release/entities/release.entity.js'
import { DeployAppController } from '#src/app/release/use-cases/deploy-app/deploy-app.controller.js'
import { DeployAppRepository } from '#src/app/release/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppUseCase } from '#src/app/release/use-cases/deploy-app/deploy-app.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule, MikroOrmModule.forFeature([App, Release])],
  controllers: [DeployAppController],
  providers: [DeployAppUseCase, DeployAppRepository],
})
export class DeployAppModule {}
