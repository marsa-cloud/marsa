import { ApiProperty } from '@nestjs/swagger'
import { IsAppEnvRecord } from '#src/app/app-management/entities/app-env.js'

export class UpdateAppEnvCommand {
  @ApiProperty({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { LOG_LEVEL: 'info' },
    description:
      'The complete set of environment variables to store. Replaces the existing set — omit a key to remove it, send {} to clear them all.',
  })
  @IsAppEnvRecord()
  env!: Record<string, string>
}
