import { ApiProperty } from '@nestjs/swagger'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
import type { DatabaseRow } from '#src/app/database-management/entities/database.table.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database-management/enums/database-engine.enum.js'
import type { DatabasePlacement } from '#src/app/database-management/queries/database-placement.js'
import {
  DatabaseEnvironmentRef,
  DatabaseProjectRef,
} from '#src/app/database-management/responses/database-refs.response.js'
import {
  type DatabaseStatus,
  DatabaseStatusApiProperty,
} from '#src/modules/runtime/runtime.enums.js'

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

  @ApiProperty({ type: DatabaseProjectRef })
  readonly project: DatabaseProjectRef

  @ApiProperty({ type: DatabaseEnvironmentRef })
  readonly environment: DatabaseEnvironmentRef

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor({ database, project, environment }: DatabasePlacement, status: DatabaseStatus) {
    this.slug = database.slug
    this.engine = database.engine
    this.version = database.version
    this.image = database.image
    this.storageGib = database.storageGib
    this.status = status
    this.nodePin = nodePinOf(database)
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
