import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { DatabaseRow } from '#src/app/database-management/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

export class ViewDatabaseIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: DatabaseUuid

  static from(database: DatabaseRow): ViewDatabaseIndexQueryKey {
    const key = new ViewDatabaseIndexQueryKey()
    key.uuid = database.uuid
    return key
  }

  static nextKey(databases: DatabaseRow[]): ViewDatabaseIndexQueryKey | null {
    const last = databases.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewDatabaseIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewDatabaseIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewDatabaseIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewDatabaseIndexQueryKey | null
}

export class ViewDatabaseIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewDatabaseIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewDatabaseIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewDatabaseIndexPaginationQuery

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Only databases in this environment.',
  })
  @IsOptional()
  @IsUUID()
  environmentUuid?: EnvironmentUuid
}
