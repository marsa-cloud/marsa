import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'

export class CreateEnvironmentCommandBuilder {
  private readonly command: CreateEnvironmentCommand

  constructor() {
    this.command = new CreateEnvironmentCommand()
    this.command.name = 'Production'
    this.command.slug = 'production'
  }

  withName(name: string): this {
    this.command.name = name
    return this
  }

  withSlug(slug: string): this {
    this.command.slug = slug
    return this
  }

  build(): CreateEnvironmentCommand {
    return this.command
  }
}
