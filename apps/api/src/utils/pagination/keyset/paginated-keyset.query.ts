import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsPositive, Max, ValidateNested } from 'class-validator'
import { DEFAULT_PAGINATION_MAX_LIMIT } from '#src/utils/pagination/pagination-mapper.js'
import { SearchQuery } from '#src/utils/pagination/search.query.js'

export class PaginatedKeysetQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: DEFAULT_PAGINATION_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @Max(DEFAULT_PAGINATION_MAX_LIMIT)
  @IsPositive()
  @IsInt()
  limit?: number

  // Opaque to this layer: the implementor decides whether it carries an encoded
  // string or a structured object, and owns encoding and decoding it.
  @ApiPropertyOptional()
  @IsOptional()
  key?: string | object | null
}

export abstract class PaginatedKeysetSearchQuery extends SearchQuery {
  @ApiPropertyOptional({ type: PaginatedKeysetQuery })
  @IsOptional()
  @Type(() => PaginatedKeysetQuery)
  @ValidateNested()
  pagination?: PaginatedKeysetQuery
}
