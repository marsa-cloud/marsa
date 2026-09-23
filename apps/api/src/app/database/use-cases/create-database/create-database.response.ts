import { ApiProperty } from '@nestjs/swagger'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database/enums/database-engine.enum.js'

export class CreateDatabaseResponse {
  @ApiProperty({ type: String, example: 'orders' })
  readonly slug: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  readonly engine: DatabaseEngine

  @ApiProperty({ type: String, example: '17' })
  readonly version: string

  @ApiProperty({ type: String, example: 'orders', description: 'In-cluster hostname.' })
  readonly host: string

  @ApiProperty({ type: 'integer', example: 5432 })
  readonly port: number

  constructor(database: DatabaseRow, port: number) {
    this.slug = database.slug
    this.engine = database.engine
    this.version = database.version
    this.host = database.slug
    this.port = port
  }
}
