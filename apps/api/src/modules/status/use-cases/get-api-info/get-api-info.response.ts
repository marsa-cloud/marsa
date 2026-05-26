import { ApiProperty } from '@nestjs/swagger'

export class GetApiInfoResponse {
  @ApiProperty({ type: String, example: 'marsa-api' })
  name: string

  @ApiProperty({ type: String, example: '0.0.0' })
  version: string

  @ApiProperty({ type: String, nullable: true })
  commit: string | null

  @ApiProperty({ type: String, example: 'development' })
  nodeEnv: string

  @ApiProperty({ type: Number, example: 12 })
  uptimeSeconds: number
}
