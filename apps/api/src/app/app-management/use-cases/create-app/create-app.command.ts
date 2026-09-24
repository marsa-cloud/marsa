import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import {
  DEFAULT_SOURCE_CONTAINER_PORT,
  MAX_CONTAINER_PORT,
  MAX_REPLICAS,
  MIN_CONTAINER_PORT,
  MIN_REPLICAS,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
} from '#src/app/app-management/entities/app-config.constants.js'
import { IsAppEnvRecord } from '#src/app/app-management/entities/app-env.js'
import { IsExactlyOneOf } from '#src/app/app-management/entities/is-exactly-one-of.validator.js'
import { ImagePullCredentials } from '#src/app/app-management/entities/image-pull-credentials.js'
import { IsGteField } from '#src/app/app-management/entities/is-gte-field.validator.js'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { CreateAppSourceCommand } from '#src/app/app-management/use-cases/create-app/create-app-source.command.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'

export class CreateAppCommand {
  @ApiProperty({ type: String, format: 'uuid', description: 'Environment the app lives in.' })
  @IsUUID()
  environmentUuid!: EnvironmentUuid

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

  @ApiPropertyOptional({
    type: String,
    example: 'nginx:1.27',
    description: 'Fully-qualified image ref. Send this or source, not both.',
  })
  @ValidateIf(
    (command: CreateAppCommand) => command.image !== undefined || command.source === undefined,
  )
  @IsExactlyOneOf('source')
  @IsString()
  @IsNotEmpty()
  image?: string

  @ApiPropertyOptional({
    type: CreateAppSourceCommand,
    description: 'GitHub repo to build and deploy. Send this or image, not both.',
  })
  @ValidateIf((command: CreateAppCommand) => command.source !== undefined)
  @ValidateNested()
  @Type(() => CreateAppSourceCommand)
  source?: CreateAppSourceCommand

  @ApiPropertyOptional({
    type: 'integer',
    example: 80,
    description: `Port the container listens on. Required with image; defaults to ${DEFAULT_SOURCE_CONTAINER_PORT} with source.`,
    minimum: MIN_CONTAINER_PORT,
    maximum: MAX_CONTAINER_PORT,
  })
  @ValidateIf(
    (command: CreateAppCommand) =>
      command.image !== undefined || command.containerPort !== undefined,
  )
  @IsInt()
  @Min(MIN_CONTAINER_PORT)
  @Max(MAX_CONTAINER_PORT)
  containerPort?: number

  @ApiPropertyOptional({
    type: 'integer',
    example: 1,
    description: 'Replica floor. 0 lets the app sleep when idle and wake on the first request.',
    minimum: MIN_REPLICAS,
    maximum: MAX_REPLICAS,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_REPLICAS)
  @Max(MAX_REPLICAS)
  minReplicas?: number

  @ApiPropertyOptional({
    type: 'integer',
    example: 1,
    description: 'Replica ceiling. Must be at least the floor, and at least 1.',
    minimum: 1,
    maximum: MAX_REPLICAS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_REPLICAS)
  @IsGteField('minReplicas')
  maxReplicas?: number

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { LOG_LEVEL: 'info' },
    description: 'Plain (non-secret) environment variables for the container.',
  })
  @IsOptional()
  @IsAppEnvRecord()
  env?: Record<string, string>

  @ApiPropertyOptional({
    type: ImagePullCredentials,
    description: 'Registry credentials for a private image; encrypted at rest.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImagePullCredentials)
  imagePullCredentials?: ImagePullCredentials

  @ApiPropertyOptional({
    type: NodePin,
    description: 'Restrict scheduling to nodes matching this label. Omit to schedule anywhere.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NodePin)
  nodePin?: NodePin
}
