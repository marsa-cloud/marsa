import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { Build } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

export class ViewBuildIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: BuildUuid

  static from(build: Build): ViewBuildIndexQueryKey {
    const key = new ViewBuildIndexQueryKey()
    key.uuid = build.uuid
    return key
  }

  static nextKey(builds: Build[]): ViewBuildIndexQueryKey | null {
    const last = builds.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewBuildIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewBuildIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewBuildIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewBuildIndexQueryKey | null
}

export class ViewBuildIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewBuildIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewBuildIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewBuildIndexPaginationQuery
}
