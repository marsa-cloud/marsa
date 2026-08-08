import { Module } from '@nestjs/common'
import { DeleteAppController } from '#src/app/app-management/use-cases/delete-app/delete-app.controller.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [DeleteAppController],
  providers: [DeleteAppUseCase, DeleteAppRepository],
})
export class DeleteAppModule {}
