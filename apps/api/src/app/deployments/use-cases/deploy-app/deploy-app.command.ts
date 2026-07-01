import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

import {
  MAX_CONTAINER_PORT,
  MIN_CONTAINER_PORT,
  MIN_REPLICAS,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
} from '#src/app/deployments/use-cases/deploy-app/deploy-app.constants.js'
import { IsStringRecord } from '#src/app/deployments/use-cases/deploy-app/is-string-record.validator.js'

export class DeployAppCommand {
  @ApiProperty({
    type: String,
    example: 'my-app',
    description: 'Public subdomain label + K8s object name.',
    pattern: SLUG_PATTERN.source,
    maxLength: SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, { message: 'slug must be a valid DNS-1123 label' })
  slug!: string

  @ApiProperty({
    type: String,
    example: 'nginx:1.27',
    description: 'Fully-qualified public image ref.',
  })
  @IsString()
  @IsNotEmpty()
  image!: string

  @ApiProperty({
    type: 'integer',
    example: 80,
    description: 'Port the container listens on.',
    minimum: MIN_CONTAINER_PORT,
    maximum: MAX_CONTAINER_PORT,
  })
  @IsInt()
  @Min(MIN_CONTAINER_PORT)
  @Max(MAX_CONTAINER_PORT)
  containerPort!: number

  @ApiPropertyOptional({
    type: 'integer',
    example: 1,
    description: 'Replica count (defaults to 1).',
    minimum: MIN_REPLICAS,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_REPLICAS)
  replicas?: number

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { LOG_LEVEL: 'info' },
    description: 'Plain (non-secret) environment variables for the container.',
  })
  @IsOptional()
  @IsStringRecord()
  env?: Record<string, string>
}
