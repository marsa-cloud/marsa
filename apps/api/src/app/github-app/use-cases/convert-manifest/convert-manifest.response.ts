import { ApiProperty } from '@nestjs/swagger'

export class ConvertManifestResponse {
  @ApiProperty({ type: String, example: 'marsa-demo-marsa-cc' })
  appSlug!: string

  @ApiProperty({ type: String, example: 'marsa-demo.marsa.cc' })
  appName!: string

  @ApiProperty({ type: String, example: 'https://github.com/apps/marsa-demo-marsa-cc' })
  htmlUrl!: string

  @ApiProperty({
    type: String,
    description: 'Where the operator installs the App on their repos (#23).',
    example: 'https://github.com/apps/marsa-demo-marsa-cc/installations/new',
  })
  installUrl!: string
}
