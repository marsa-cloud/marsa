import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID } from 'class-validator'

export class CreateReleaseCommand {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Roll back: copy this release’s config instead of the app’s current config.',
  })
  @IsOptional()
  @IsUUID()
  fromReleaseUuid?: string
}
