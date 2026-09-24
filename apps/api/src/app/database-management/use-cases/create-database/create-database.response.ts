import { ApiProperty } from '@nestjs/swagger'
import type { DatabaseRow } from '#src/app/database-management/entities/database.table.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database-management/enums/database-engine.enum.js'

export class CreateDatabaseResponse {
  @ApiProperty({ type: String, example: 'orders' })
  readonly slug: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  readonly engine: DatabaseEngine

  @ApiProperty({ type: String, example: '17' })
  readonly version: string

  constructor(database: DatabaseRow) {
    this.slug = database.slug
    this.engine = database.engine
    this.version = database.version
  }
}
