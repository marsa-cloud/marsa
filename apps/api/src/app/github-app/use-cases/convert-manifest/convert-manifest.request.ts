import { ApiProperty } from '@nestjs/swagger'

export class ConvertManifestRequest {
  @ApiProperty({ type: String, description: 'Temporary code from the GitHub redirect.' })
  code!: string

  @ApiProperty({ type: String, description: 'Signed CSRF state echoed back by GitHub.' })
  state!: string
}
