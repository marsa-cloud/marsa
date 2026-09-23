import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { DEFAULT_STORAGE_GIB } from '#src/app/database/entities/database-config.constants.js'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import { DatabaseEngine } from '#src/app/database/enums/database-engine.enum.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class DatabaseBuilder {
  private readonly database: DatabaseRow

  constructor() {
    const now = new Date()
    this.database = {
      uuid: generateUuid<DatabaseUuid>(),
      environmentUuid: generateUuid<EnvironmentUuid>(),
      slug: 'my-database',
      engine: DatabaseEngine.Postgres,
      version: '17',
      image: 'postgres:17.11',
      credentialsEnc: 'sealed',
      storageGib: DEFAULT_STORAGE_GIB,
      nodePin: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withEnvironmentUuid(environmentUuid: EnvironmentUuid): this {
    this.database.environmentUuid = environmentUuid
    return this
  }

  withSlug(slug: string): this {
    this.database.slug = slug
    return this
  }

  withEngine(engine: DatabaseEngine): this {
    this.database.engine = engine
    return this
  }

  withVersion(version: string): this {
    this.database.version = version
    return this
  }

  withImage(image: string): this {
    this.database.image = image
    return this
  }

  withCredentialsEnc(credentialsEnc: string): this {
    this.database.credentialsEnc = credentialsEnc
    return this
  }

  withStorageGib(storageGib: number): this {
    this.database.storageGib = storageGib
    return this
  }

  withNodePin(nodePin: NodePin | null): this {
    this.database.nodePin = nodePin
    return this
  }

  build(): DatabaseRow {
    return this.database
  }
}
