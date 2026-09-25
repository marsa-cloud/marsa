import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { DatabaseEngine } from '#src/app/database-management/enums/database-engine.enum.js'
import { CreateDatabaseCommand } from '#src/app/database-management/use-cases/create-database/create-database.command.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class CreateDatabaseCommandBuilder {
  private readonly command: CreateDatabaseCommand

  constructor() {
    this.command = new CreateDatabaseCommand()
    this.command.environmentUuid = generateUuid<EnvironmentUuid>()
    this.command.slug = 'my-database'
    this.command.engine = DatabaseEngine.Postgres
    this.command.version = '17'
  }

  withEnvironmentUuid(environmentUuid: EnvironmentUuid): this {
    this.command.environmentUuid = environmentUuid
    return this
  }

  withSlug(slug: string): this {
    this.command.slug = slug
    return this
  }

  withEngine(engine: DatabaseEngine): this {
    this.command.engine = engine
    return this
  }

  withVersion(version: string): this {
    this.command.version = version
    return this
  }

  withStorageGib(storageGib: number): this {
    this.command.storageGib = storageGib
    return this
  }

  withNodePin(nodePin: NodePin): this {
    this.command.nodePin = nodePin
    return this
  }

  build(): CreateDatabaseCommand {
    return this.command
  }
}
