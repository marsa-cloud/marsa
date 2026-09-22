import { CreateProjectCommand } from '#src/app/project/use-cases/create-project/create-project.command.js'

export class CreateProjectCommandBuilder {
  private readonly command: CreateProjectCommand

  constructor() {
    this.command = new CreateProjectCommand()
    this.command.name = 'My Project'
    this.command.slug = 'my-project'
  }

  withName(name: string): this {
    this.command.name = name
    return this
  }

  withSlug(slug: string): this {
    this.command.slug = slug
    return this
  }

  build(): CreateProjectCommand {
    return this.command
  }
}
