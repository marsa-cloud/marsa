import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
import {
  DATABASE_SLUG_MAX_LENGTH,
  DATABASE_SLUG_PATTERN,
  MAX_STORAGE_GIB,
  MIN_STORAGE_GIB,
} from '#src/app/database/entities/database-config.constants.js'
import { SUPPORTED_MAJORS } from '#src/app/database/entities/engine-catalogue.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database/enums/database-engine.enum.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'

export class CreateDatabaseCommand {
  @ApiProperty({ type: String, format: 'uuid', description: 'Environment the database lives in.' })
  @IsUUID()
  environmentUuid!: EnvironmentUuid

  @ApiProperty({
    type: String,
    example: 'orders',
    description: 'In-cluster hostname + K8s object name.',
    pattern: DATABASE_SLUG_PATTERN.source,
    maxLength: DATABASE_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DATABASE_SLUG_MAX_LENGTH)
  @Matches(DATABASE_SLUG_PATTERN, { message: 'slug must be a valid DNS-1035 label' })
  slug!: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  @IsIn(Object.values(DatabaseEngine))
  engine!: DatabaseEngine

  @ApiProperty({ type: String, example: '17', description: 'Major version, pinned at creation.' })
  @IsIn(Object.values(SUPPORTED_MAJORS).flat())
  version!: string

  @ApiPropertyOptional({
    type: 'integer',
    example: 10,
    description: 'Requested volume size. Recorded, but local-path does not enforce it (#209).',
    minimum: MIN_STORAGE_GIB,
    maximum: MAX_STORAGE_GIB,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_STORAGE_GIB)
  @Max(MAX_STORAGE_GIB)
  storageGib?: number

  @ApiPropertyOptional({
    type: NodePin,
    description: 'Node the data lives on. Set at creation, immutable afterwards.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NodePin)
  nodePin?: NodePin
}
