import { ApiProperty } from '@nestjs/swagger'

export class ViewBuildLogsResponse {
  @ApiProperty({ type: String, example: '#1 [internal] load build definition from Dockerfile' })
  readonly logs: string

  constructor(logs: string) {
    this.logs = logs
  }
}
