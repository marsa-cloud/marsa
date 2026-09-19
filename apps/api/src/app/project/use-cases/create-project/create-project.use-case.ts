import { ConflictException, Injectable } from '@nestjs/common'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { CreateProjectCommand } from '#src/app/project/use-cases/create-project/create-project.command.js'
import { CreateProjectRepository } from '#src/app/project/use-cases/create-project/create-project.repository.js'
import { CreateProjectResponse } from '#src/app/project/use-cases/create-project/create-project.response.js'

@Injectable()
export class CreateProjectUseCase {
  constructor(private readonly repository: CreateProjectRepository) {}

  async execute(command: CreateProjectCommand): Promise<CreateProjectResponse> {
    const project = new ProjectBuilder().withName(command.name).withSlug(command.slug).build()

    if (!(await this.repository.insert(project))) {
      throw new ConflictException(`A project with slug '${command.slug}' already exists.`)
    }

    return new CreateProjectResponse(project)
  }
}
