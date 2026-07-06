import { Module } from '@nestjs/common'

import { GetAppRunLogsController } from '#src/app/deployments/use-cases/get-app-run-logs/get-app-run-logs.controller.js'
import { GetAppRunLogsUseCase } from '#src/app/deployments/use-cases/get-app-run-logs/get-app-run-logs.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [GetAppRunLogsController],
  providers: [GetAppRunLogsUseCase],
})
export class GetAppRunLogsModule {}
