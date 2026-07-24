import { Module } from '@nestjs/common'
import { ListAppReleasesController } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.controller.js'
import { ListAppReleasesRepository } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.repository.js'
import { ListAppReleasesUseCase } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [ListAppReleasesController],
  providers: [ListAppReleasesUseCase, ListAppReleasesRepository],
})
export class ListAppReleasesModule {}
