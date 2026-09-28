import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import {
  DEFAULT_TAIL_LINES,
  MAX_TAIL_LINES,
  MIN_TAIL_LINES,
} from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.constants.js'

export class ViewBuildLogsQuery {
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
