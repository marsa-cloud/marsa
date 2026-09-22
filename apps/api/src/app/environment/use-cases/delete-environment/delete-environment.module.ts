import { Module } from '@nestjs/common'
import { DeleteEnvironmentController } from '#src/app/environment/use-cases/delete-environment/delete-environment.controller.js'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import { DeleteEnvironmentUseCase } from '#src/app/environment/use-cases/delete-environment/delete-environment.use-case.js'

@Module({
  controllers: [DeleteEnvironmentController],
  providers: [DeleteEnvironmentUseCase, DeleteEnvironmentRepository],
})
export class DeleteEnvironmentModule {}
