import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator'
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_SLUG_MAX_LENGTH,
} from '#src/app/project/entities/project-config.constants.js'
import { DNS_LABEL_PATTERN } from '#src/utils/dns-label.js'

export class CreateProjectCommand {
  @ApiProperty({ type: String, example: 'Demo', maxLength: PROJECT_NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name!: string

  @ApiProperty({
    type: String,
    example: 'demo',
    description: 'Unique across Marsa.',
    pattern: DNS_LABEL_PATTERN.source,
    maxLength: PROJECT_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_SLUG_MAX_LENGTH)
  @Matches(DNS_LABEL_PATTERN, { message: 'slug must be a valid DNS-1123 label' })
  slug!: string
}
