import { Module } from '@nestjs/common'
import { ViewProjectIndexController } from '#src/app/project/use-cases/view-project-index/view-project-index.controller.js'
import { ViewProjectIndexRepository } from '#src/app/project/use-cases/view-project-index/view-project-index.repository.js'
import { ViewProjectIndexUseCase } from '#src/app/project/use-cases/view-project-index/view-project-index.use-case.js'

@Module({
  controllers: [ViewProjectIndexController],
  providers: [ViewProjectIndexUseCase, ViewProjectIndexRepository],
})
export class ViewProjectIndexModule {}
