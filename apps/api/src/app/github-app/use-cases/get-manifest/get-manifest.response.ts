import { ApiProperty } from '@nestjs/swagger'

import type { GitHubAppManifest } from '#src/app/github-app/github-app.types.js'

export class GetManifestResponse {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'GitHub App manifest — the FE posts this as the `manifest` form field.',
  })
  readonly manifest: GitHubAppManifest

  @ApiProperty({
    type: String,
    example: 'https://github.com/settings/apps/new?state=abc123',
    description: 'Form action the FE submits the manifest to.',
  })
  readonly formAction: string

  @ApiProperty({
    type: String,
    description: 'Signed CSRF state; echoed back by GitHub on the callback.',
  })
  readonly state: string

  constructor(manifest: GitHubAppManifest, formAction: string, state: string) {
    this.manifest = manifest
    this.formAction = formAction
    this.state = state
  }
}
