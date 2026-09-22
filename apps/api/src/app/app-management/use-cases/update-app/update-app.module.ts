import { Module } from '@nestjs/common'
import { UpdateAppController } from '#src/app/app-management/use-cases/update-app/update-app.controller.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppUseCase } from '#src/app/app-management/use-cases/update-app/update-app.use-case.js'
import { ApplyReleaseModule } from '#src/app/release/services/apply-release/apply-release.module.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [ApplyReleaseModule, KubernetesModule],
  controllers: [UpdateAppController],
  providers: [UpdateAppUseCase, UpdateAppRepository],
})
export class UpdateAppModule {}
