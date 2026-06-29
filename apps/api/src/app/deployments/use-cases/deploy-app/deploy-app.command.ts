import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/**
 * DNS-1123 label: the slug becomes the public subdomain (`<slug>.<base>`) and
 * the K8s object names, so it must be a valid label (lowercase alphanumeric +
 * hyphens, ≤ 63 chars). Validated here at the boundary (Rex flagged this on #97).
 */
export const SLUG_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
export const SLUG_MAX_LENGTH = 63

export class DeployAppCommand {
  @ApiProperty({ type: String, example: 'my-app', description: 'Public subdomain label + K8s object name.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, { message: 'slug must be a valid DNS-1123 label' })
  slug!: string

  @ApiProperty({ type: String, example: 'nginx:1.27', description: 'Fully-qualified public image ref.' })
  @IsString()
  @IsNotEmpty()
  image!: string

  @ApiProperty({ type: Number, example: 80, description: 'Port the container listens on.' })
  @IsInt()
  @Min(1)
  @Max(65535)
  containerPort!: number

  @ApiPropertyOptional({ type: Number, example: 1, description: 'Replica count (defaults to 1).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  replicas?: number

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { LOG_LEVEL: 'info' },
    description: 'Plain (non-secret) environment variables for the container.',
  })
  @IsOptional()
  @IsObject()
  env?: Record<string, string>
}
