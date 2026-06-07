import { ApiProperty } from '@nestjs/swagger'

export class GetManifestResponse {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'GitHub App manifest — the FE posts this as the `manifest` form field.',
  })
  manifest!: Record<string, unknown>

  @ApiProperty({
    type: String,
    example: 'https://github.com/settings/apps/new?state=abc123',
    description: 'Form action the FE submits the manifest to.',
  })
  formAction!: string

  @ApiProperty({
    type: String,
    description: 'Signed CSRF state; echoed back by GitHub on the callback.',
  })
  state!: string
}
