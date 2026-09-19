import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

export class ViewEnvironmentIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: EnvironmentUuid

  static from(environment: Environment): ViewEnvironmentIndexQueryKey {
    const key = new ViewEnvironmentIndexQueryKey()
    key.uuid = environment.uuid
    return key
  }

  static nextKey(environments: Environment[]): ViewEnvironmentIndexQueryKey | null {
    const last = environments.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewEnvironmentIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewEnvironmentIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewEnvironmentIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewEnvironmentIndexQueryKey | null
}

export class ViewEnvironmentIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewEnvironmentIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewEnvironmentIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewEnvironmentIndexPaginationQuery
}
