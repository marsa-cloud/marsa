import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import {
  DEFAULT_TAIL_LINES,
  MAX_TAIL_LINES,
  MIN_TAIL_LINES,
} from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.constants.js'

export class ViewAppLogsQuery {
  // Query values arrive as strings; the global ValidationPipe has `transform`
  // but not `enableImplicitConversion`, so `@Type(() => Number)` is what coerces
  // this to a number before `@IsInt`/`@Min`/`@Max` validate it.
  @ApiPropertyOptional({
    type: 'integer',
    minimum: MIN_TAIL_LINES,
    maximum: MAX_TAIL_LINES,
    example: DEFAULT_TAIL_LINES,
    description: `Trailing log lines to return (default ${DEFAULT_TAIL_LINES}).`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_TAIL_LINES)
  @Max(MAX_TAIL_LINES)
  tailLines?: number
}
