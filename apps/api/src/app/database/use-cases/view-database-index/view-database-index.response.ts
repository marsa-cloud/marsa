import { ApiProperty } from '@nestjs/swagger'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database/enums/database-engine.enum.js'
import type { DatabasePlacement } from '#src/app/database/queries/database-placement.js'
import {
  DatabaseEnvironmentRef,
  DatabaseProjectRef,
} from '#src/app/database/responses/database-refs.response.js'
import { ViewDatabaseIndexQueryKey } from '#src/app/database/use-cases/view-database-index/query/view-database-index.query.js'
import {
  type DatabaseStatus,
  DatabaseStatusApiProperty,
} from '#src/modules/runtime/runtime.enums.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class DatabaseSummary {
  @ApiProperty({ type: String, example: 'orders' })
  readonly slug: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  readonly engine: DatabaseEngine

  @ApiProperty({ type: String, example: '17' })
  readonly version: string

  @DatabaseStatusApiProperty()
  readonly status: DatabaseStatus

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
    this.status = status
    this.project = new DatabaseProjectRef(project)
    this.environment = new DatabaseEnvironmentRef(environment)
    this.createdAt = database.createdAt.toISOString()
    this.updatedAt = database.updatedAt.toISOString()
  }
}

export class ViewDatabaseIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewDatabaseIndexQueryKey, nullable: true })
  declare readonly next: ViewDatabaseIndexQueryKey | null

  constructor(placements: DatabasePlacement[]) {
    super(ViewDatabaseIndexQueryKey.nextKey(placements.map((placement) => placement.database)))
  }
}

export class ViewDatabaseIndexResponse extends PaginatedKeysetResponse<DatabaseSummary> {
  @ApiProperty({ type: [DatabaseSummary] })
  declare readonly items: DatabaseSummary[]

  // Redeclared so the generated client types the cursor; inheriting `meta` loses it.
  @ApiProperty({ type: ViewDatabaseIndexResponseMeta })
  declare readonly meta: ViewDatabaseIndexResponseMeta

  constructor(summaries: DatabaseSummary[], placements: DatabasePlacement[]) {
    super(summaries, new ViewDatabaseIndexResponseMeta(placements))
  }
}
