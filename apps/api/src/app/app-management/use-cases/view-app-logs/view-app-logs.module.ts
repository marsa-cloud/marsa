import { Module } from '@nestjs/common'
import { ViewAppLogsController } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.controller.js'
import { ViewAppLogsUseCase } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [ViewAppLogsController],
  providers: [ViewAppLogsUseCase],
})
export class ViewAppLogsModule {}
