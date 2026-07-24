import { Module } from '@nestjs/common'
import { DeployAppController } from '#src/app/deployments/use-cases/deploy-app/deploy-app.controller.js'
import { DeployAppRepository } from '#src/app/deployments/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppUseCase } from '#src/app/deployments/use-cases/deploy-app/deploy-app.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [DeployAppController],
  providers: [DeployAppUseCase, DeployAppRepository],
})
export class DeployAppModule {}
