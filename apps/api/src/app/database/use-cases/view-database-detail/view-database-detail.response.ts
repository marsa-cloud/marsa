import { ApiProperty } from '@nestjs/swagger'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database/enums/database-engine.enum.js'
import type { DatabasePlacement } from '#src/app/database/queries/database-placement.js'
import {
  DatabaseEnvironmentRef,
  DatabaseProjectRef,
} from '#src/app/database/responses/database-refs.response.js'
import {
  type DatabaseStatus,
  DatabaseStatusApiProperty,
} from '#src/modules/runtime/runtime.enums.js'
import type { DatabaseCredentials } from '#src/modules/runtime/runtime.types.js'

export class DatabaseConnectionInfo {
  @ApiProperty({ type: String, example: 'orders', description: 'In-cluster hostname.' })
  readonly host: string

  @ApiProperty({ type: 'integer', example: 5432 })
  readonly port: number

  @ApiProperty({ type: String, example: 'postgres' })
  readonly user: string

  @ApiProperty({ type: String, example: 'orders' })
  readonly database: string

  // The password stays in the database's Secret and is never returned (#233).
  constructor(host: string, port: number, credentials: DatabaseCredentials) {
    this.host = host
    this.port = port
    this.user = credentials.user
    this.database = credentials.database
  }
}

export class ViewDatabaseDetailResponse {
  @ApiProperty({ type: String, example: 'orders' })
  readonly slug: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  readonly engine: DatabaseEngine

  @ApiProperty({ type: String, example: '17' })
  readonly version: string

  @ApiProperty({ type: String, example: 'postgres:17.11' })
  readonly image: string

  @ApiProperty({ type: 'integer', example: 10 })
  readonly storageGib: number

  @DatabaseStatusApiProperty()
  readonly status: DatabaseStatus

  @ApiProperty({ type: NodePin, nullable: true })
  readonly nodePin: NodePin | null

  @ApiProperty({ type: DatabaseConnectionInfo })
  readonly connection: DatabaseConnectionInfo

  @ApiProperty({ type: DatabaseProjectRef })
  readonly project: DatabaseProjectRef

  @ApiProperty({ type: DatabaseEnvironmentRef })
  readonly environment: DatabaseEnvironmentRef

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(
    { database, project, environment }: DatabasePlacement,
    status: DatabaseStatus,
    port: number,
    credentials: DatabaseCredentials,
  ) {
    this.slug = database.slug
    this.engine = database.engine
    this.version = database.version
    this.image = database.image
    this.storageGib = database.storageGib
    this.status = status
    this.nodePin = nodePinOf(database)
    this.connection = new DatabaseConnectionInfo(database.slug, port, credentials)
    this.project = new DatabaseProjectRef(project)
    this.environment = new DatabaseEnvironmentRef(environment)
    this.createdAt = database.createdAt.toISOString()
    this.updatedAt = database.updatedAt.toISOString()
  }
}

function nodePinOf(database: DatabaseRow): NodePin | null {
  if (!database.nodePin) {
    return null
  }
  const pin = new NodePin()
  pin.key = database.nodePin.key
  pin.values = database.nodePin.values
  pin.strategy = database.nodePin.strategy
  return pin
}
