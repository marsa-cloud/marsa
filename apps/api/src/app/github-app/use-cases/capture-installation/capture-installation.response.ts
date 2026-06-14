import { ApiProperty } from '@nestjs/swagger'

import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'

export class CaptureInstallationResponse {
  @ApiProperty({ type: String, example: '88776655' })
  readonly installationId: string

  @ApiProperty({ type: String, nullable: true, example: 'octo-org' })
  readonly accountLogin: string | null

  @ApiProperty({
    type: Boolean,
    description: 'True once the installation is captured and its access verified.',
    example: true,
  })
  readonly connected: boolean

  constructor(installation: GitHubInstallation) {
    this.installationId = installation.installationId
    this.accountLogin = installation.accountLogin ?? null
    this.connected = true
  }
}
