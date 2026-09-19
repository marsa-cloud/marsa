import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator'
import {
  MAX_CONTAINER_PORT,
  MAX_REPLICAS,
  MIN_CONTAINER_PORT,
  MIN_REPLICAS,
} from '#src/app/app-management/entities/app-config.constants.js'
import { IsAppEnvRecord } from '#src/app/app-management/entities/app-env.js'
import { ImagePullCredentials } from '#src/app/app-management/entities/image-pull-credentials.js'
import { IsGteField } from '#src/app/app-management/entities/is-gte-field.validator.js'

export class UpdateAppCommand {
  @ApiPropertyOptional({ type: String, example: 'nginx:1.28' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  image?: string

  @ApiPropertyOptional({
    type: 'integer',
    example: 80,
    minimum: MIN_CONTAINER_PORT,
    maximum: MAX_CONTAINER_PORT,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_CONTAINER_PORT)
  @Max(MAX_CONTAINER_PORT)
  containerPort?: number

  @ApiPropertyOptional({
    type: 'integer',
    example: 1,
    minimum: MIN_REPLICAS,
    maximum: MAX_REPLICAS,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_REPLICAS)
  @Max(MAX_REPLICAS)
  minReplicas?: number

  @ApiPropertyOptional({ type: 'integer', example: 1, minimum: 1, maximum: MAX_REPLICAS })
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
    description: 'Replaces the whole set — omit a key to remove it, send {} to clear.',
  })
  @IsOptional()
  @IsAppEnvRecord()
  env?: Record<string, string>

  @ApiPropertyOptional({
    type: ImagePullCredentials,
    nullable: true,
    description: 'Omit to keep the stored credentials, null to clear them, an object to replace.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImagePullCredentials)
  imagePullCredentials?: ImagePullCredentials | null
}
