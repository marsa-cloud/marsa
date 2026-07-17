import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import {
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  MAX_LIMIT,
  MIN_LIMIT,
} from '#src/utils/pagination/pagination.constants.js'

export class PaginatedOffsetQuery {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: MIN_LIMIT,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LIMIT)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT

  @ApiPropertyOptional({ type: 'integer', minimum: 0, default: DEFAULT_OFFSET })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = DEFAULT_OFFSET
}
