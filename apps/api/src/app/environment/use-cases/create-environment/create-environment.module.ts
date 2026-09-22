import { Module } from '@nestjs/common'
import { CreateEnvironmentController } from '#src/app/environment/use-cases/create-environment/create-environment.controller.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentUseCase } from '#src/app/environment/use-cases/create-environment/create-environment.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [CreateEnvironmentController],
  providers: [CreateEnvironmentUseCase, CreateEnvironmentRepository],
})
export class CreateEnvironmentModule {}
