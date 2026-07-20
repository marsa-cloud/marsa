import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsPositive, Max } from 'class-validator'
import { DEFAULT_PAGINATION_MAX_LIMIT } from '#src/utils/pagination/pagination-mapper.js'
import { SearchQuery } from '#src/utils/pagination/search.query.js'

export abstract class PaginatedKeysetQuery {
  @ApiProperty({ required: false, maximum: DEFAULT_PAGINATION_MAX_LIMIT, minimum: 0 })
  @Type(() => Number)
  @IsOptional()
  @Max(DEFAULT_PAGINATION_MAX_LIMIT)
  @IsPositive()
  @IsInt()
  limit?: number

  abstract key?: string | object | null
}

export abstract class PaginatedKeysetSearchQuery extends SearchQuery {
  abstract pagination?: PaginatedKeysetQuery
}
