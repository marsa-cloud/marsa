import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import {
  ALIAS_MAX_LENGTH,
  ALIAS_PATTERN,
} from '#src/app/database-management/entities/attachment-env.js'
import {
  DATABASE_SLUG_MAX_LENGTH,
  DATABASE_SLUG_PATTERN,
} from '#src/app/database-management/entities/database-config.constants.js'

export class AttachDatabaseCommand {
  @ApiProperty({
    type: String,
    example: 'orders',
    description: "Database in this app's environment.",
    pattern: DATABASE_SLUG_PATTERN.source,
    maxLength: DATABASE_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DATABASE_SLUG_MAX_LENGTH)
  @Matches(DATABASE_SLUG_PATTERN, { message: 'databaseSlug must be a valid DNS-1123 label' })
  databaseSlug!: string

  @ApiPropertyOptional({
    type: String,
    example: 'analytics',
    description:
      'Prefixes the injected variables (ANALYTICS_DATABASE_URL). Required for a second attachment.',
    pattern: ALIAS_PATTERN.source,
    maxLength: ALIAS_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ALIAS_MAX_LENGTH)
  @Matches(ALIAS_PATTERN, {
    message: 'alias must start with a letter and use lowercase letters, numbers or hyphens',
  })
  alias?: string
}
