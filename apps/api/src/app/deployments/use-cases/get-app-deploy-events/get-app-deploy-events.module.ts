import { Module } from '@nestjs/common'

import { GetAppDeployEventsController } from '#src/app/deployments/use-cases/get-app-deploy-events/get-app-deploy-events.controller.js'
import { GetAppDeployEventsUseCase } from '#src/app/deployments/use-cases/get-app-deploy-events/get-app-deploy-events.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [GetAppDeployEventsController],
  providers: [GetAppDeployEventsUseCase],
})
export class GetAppDeployEventsModule {}
