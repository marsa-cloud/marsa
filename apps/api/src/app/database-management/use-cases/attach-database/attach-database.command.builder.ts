import { AttachDatabaseCommand } from '#src/app/database-management/use-cases/attach-database/attach-database.command.js'

export class AttachDatabaseCommandBuilder {
  private readonly command: AttachDatabaseCommand

  constructor() {
    this.command = new AttachDatabaseCommand()
    this.command.databaseSlug = 'my-database'
  }

  withDatabaseSlug(databaseSlug: string): this {
    this.command.databaseSlug = databaseSlug
    return this
  }

  withAlias(alias: string): this {
    this.command.alias = alias
    return this
  }

  build(): AttachDatabaseCommand {
    return this.command
  }
}
