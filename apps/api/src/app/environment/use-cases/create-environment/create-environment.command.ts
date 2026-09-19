import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator'
import {
  ENVIRONMENT_NAME_MAX_LENGTH,
  ENVIRONMENT_SLUG_MAX_LENGTH,
} from '#src/app/environment/entities/environment-config.constants.js'
import { DNS_LABEL_PATTERN } from '#src/utils/dns-label.js'

export class CreateEnvironmentCommand {
  @ApiProperty({ type: String, example: 'Development', maxLength: ENVIRONMENT_NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ENVIRONMENT_NAME_MAX_LENGTH)
  name!: string

  @ApiProperty({
    type: String,
    example: 'dev',
    description: 'Unique within the project; second half of the namespace name.',
    pattern: DNS_LABEL_PATTERN.source,
    maxLength: ENVIRONMENT_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ENVIRONMENT_SLUG_MAX_LENGTH)
  @Matches(DNS_LABEL_PATTERN, { message: 'slug must be a valid DNS-1123 label' })
  slug!: string
}
