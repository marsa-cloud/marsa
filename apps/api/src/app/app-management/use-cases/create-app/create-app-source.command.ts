import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import {
  BRANCH_MAX_LENGTH,
  DEFAULT_DOCKERFILE_PATH,
  DEFAULT_ROOT_DIR,
  REPO_PATTERN,
  SOURCE_PATH_PATTERN,
} from '#src/app/app-management/entities/app-source.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'

const RELATIVE_PATH_MESSAGE = '$property must be a path inside the repo, without ".." segments.'

export class CreateAppSourceCommand {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Installation that can read the repo.',
  })
  @IsUUID()
  installationUuid!: GitHubInstallationUuid

  @ApiProperty({ type: String, example: 'acme/shop', pattern: REPO_PATTERN.source })
  @Matches(REPO_PATTERN, { message: 'repo must be owner/name.' })
  repo!: string

  @ApiProperty({ type: String, example: 'main', maxLength: BRANCH_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(BRANCH_MAX_LENGTH)
  branch!: string

  @ApiPropertyOptional({
    type: String,
    example: DEFAULT_ROOT_DIR,
    default: DEFAULT_ROOT_DIR,
    description: 'Build context, relative to the repo root.',
  })
  @IsOptional()
  @Matches(SOURCE_PATH_PATTERN, { message: RELATIVE_PATH_MESSAGE })
  rootDir?: string

  @ApiPropertyOptional({
    type: String,
    example: DEFAULT_DOCKERFILE_PATH,
    default: DEFAULT_DOCKERFILE_PATH,
    description: 'Relative to rootDir.',
  })
  @IsOptional()
  @Matches(SOURCE_PATH_PATTERN, { message: RELATIVE_PATH_MESSAGE })
  dockerfilePath?: string
}
