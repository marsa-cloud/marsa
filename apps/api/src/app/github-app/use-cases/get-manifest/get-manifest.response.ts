import { ApiProperty } from '@nestjs/swagger'

import { ManifestDto } from '#src/app/github-app/github-app.types.js'

export class GetManifestResponse {
  @ApiProperty({
    type: ManifestDto,
    description: 'GitHub App manifest — the FE posts this as the `manifest` form field.',
  })
  readonly manifest: ManifestDto

  @ApiProperty({
    type: String,
    example: 'https://github.com/settings/apps/new?state=abc123',
    description: 'Form action the FE submits the manifest to.',
  })
  readonly formAction: string

  @ApiProperty({
    type: String,
    description:
      'Single-use CSRF state token (DB-backed, expires in 10 min); echoed back by GitHub on the callback.',
  })
  readonly state: string

  constructor(manifest: ManifestDto, formAction: string, state: string) {
    this.manifest = manifest
    this.formAction = formAction
    this.state = state
  }
}
