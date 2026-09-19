import { Module } from '@nestjs/common'
import { CreateProjectModule } from '#src/app/project/use-cases/create-project/create-project.module.js'
import { DeleteProjectModule } from '#src/app/project/use-cases/delete-project/delete-project.module.js'
import { ViewProjectIndexModule } from '#src/app/project/use-cases/view-project-index/view-project-index.module.js'

@Module({
  imports: [CreateProjectModule, ViewProjectIndexModule, DeleteProjectModule],
})
export class ProjectModule {}
