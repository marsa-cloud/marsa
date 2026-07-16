import { Module } from '@nestjs/common'
import { GetAppHealthController } from '#src/app/deployments/use-cases/get-app-health/get-app-health.controller.js'
import { GetAppHealthUseCase } from '#src/app/deployments/use-cases/get-app-health/get-app-health.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [GetAppHealthController],
  providers: [GetAppHealthUseCase],
})
export class GetAppHealthModule {}
