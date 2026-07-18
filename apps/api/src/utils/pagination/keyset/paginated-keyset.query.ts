import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { DEFAULT_LIMIT, MAX_LIMIT, MIN_LIMIT } from '#src/utils/pagination/pagination.constants.js'

export class PaginatedKeysetQuery {
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

  @ApiPropertyOptional({
    type: 'string',
    description: 'Opaque cursor from a previous page’s meta.nextCursor.',
  })
  @IsOptional()
  @IsString()
  cursor?: string
}
