import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

export class ViewAppIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: AppUuid

  static from(app: App): ViewAppIndexQueryKey {
    const key = new ViewAppIndexQueryKey()
    key.uuid = app.uuid
    return key
  }

  static nextKey(apps: App[]): ViewAppIndexQueryKey | null {
    const last = apps.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewAppIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewAppIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewAppIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewAppIndexQueryKey | null
}

export class ViewAppIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewAppIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewAppIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewAppIndexPaginationQuery
}
