import { ApiProperty } from '@nestjs/swagger'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'

export class AppSourceResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly installationUuid: string

  @ApiProperty({ type: String, example: 'acme/shop' })
  readonly repo: string

  @ApiProperty({ type: String, example: 'main' })
  readonly branch: string

  @ApiProperty({ type: String, example: '.' })
  readonly rootDir: string

  @ApiProperty({ type: String, example: 'Dockerfile' })
  readonly dockerfilePath: string

  constructor(source: AppSource) {
    this.installationUuid = source.installationUuid
    this.repo = source.repo
    this.branch = source.branch
    this.rootDir = source.rootDir
    this.dockerfilePath = source.dockerfilePath
  }
}
