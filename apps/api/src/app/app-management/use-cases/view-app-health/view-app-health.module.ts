import { Module } from '@nestjs/common'
import { ViewAppHealthController } from '#src/app/app-management/use-cases/view-app-health/view-app-health.controller.js'
import { ViewAppHealthRepository } from '#src/app/app-management/use-cases/view-app-health/view-app-health.repository.js'
import { ViewAppHealthUseCase } from '#src/app/app-management/use-cases/view-app-health/view-app-health.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [ViewAppHealthController],
  providers: [ViewAppHealthUseCase, ViewAppHealthRepository],
})
export class ViewAppHealthModule {}
