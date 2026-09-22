import { Module } from '@nestjs/common'
import { CreateProjectController } from '#src/app/project/use-cases/create-project/create-project.controller.js'
import { CreateProjectRepository } from '#src/app/project/use-cases/create-project/create-project.repository.js'
import { CreateProjectUseCase } from '#src/app/project/use-cases/create-project/create-project.use-case.js'

@Module({
  controllers: [CreateProjectController],
  providers: [CreateProjectUseCase, CreateProjectRepository],
})
export class CreateProjectModule {}
