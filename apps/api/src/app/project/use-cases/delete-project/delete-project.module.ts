import { Module } from '@nestjs/common'
import { DeleteProjectController } from '#src/app/project/use-cases/delete-project/delete-project.controller.js'
import { DeleteProjectRepository } from '#src/app/project/use-cases/delete-project/delete-project.repository.js'
import { DeleteProjectUseCase } from '#src/app/project/use-cases/delete-project/delete-project.use-case.js'

@Module({
  controllers: [DeleteProjectController],
  providers: [DeleteProjectUseCase, DeleteProjectRepository],
})
export class DeleteProjectModule {}
