import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { Release } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

/** Seek position for an app's release history — the uuidv7 primary key. */
export class ViewReleaseIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: ReleaseUuid

  static from(release: Release): ViewReleaseIndexQueryKey {
    const key = new ViewReleaseIndexQueryKey()
    key.uuid = release.uuid
    return key
  }

  /** From the last release returned; `null` once a page comes back empty. */
  static nextKey(releases: Release[]): ViewReleaseIndexQueryKey | null {
    const last = releases.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewReleaseIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewReleaseIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewReleaseIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewReleaseIndexQueryKey | null
}

export class ViewReleaseIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewReleaseIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewReleaseIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewReleaseIndexPaginationQuery
}
