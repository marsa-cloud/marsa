import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsPositive, Max, Min, ValidateNested } from 'class-validator'
import { DEFAULT_PAGINATION_MAX_LIMIT } from '#src/utils/pagination/pagination-mapper.js'
import { SearchQuery } from '#src/utils/pagination/search.query.js'

export class PaginatedOffsetQuery {
  @ApiProperty({ minimum: 1, maximum: DEFAULT_PAGINATION_MAX_LIMIT })
  @Type(() => Number)
  @Max(DEFAULT_PAGINATION_MAX_LIMIT)
  @IsPositive()
  @IsInt()
  limit!: number

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @Min(0)
  @IsInt()
  offset!: number
}

export abstract class PaginatedOffsetSearchQuery extends SearchQuery {
  @ApiProperty({ type: PaginatedOffsetQuery, required: false })
  @IsOptional()
  @Type(() => PaginatedOffsetQuery)
  @ValidateNested()
  pagination?: PaginatedOffsetQuery
}
