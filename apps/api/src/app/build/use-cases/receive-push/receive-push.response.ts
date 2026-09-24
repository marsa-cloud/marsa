import { ApiProperty } from '@nestjs/swagger'
import type { Build } from '#src/app/build/entities/build.table.js'

export interface StartedBuild {
  appSlug: string
  build: Build
}

export class ReceivedBuild {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly appSlug: string

  @ApiProperty({ type: String, format: 'uuid' })
  readonly buildUuid: string

  constructor({ appSlug, build }: StartedBuild) {
    this.appSlug = appSlug
    this.buildUuid = build.uuid
  }
}

export class ReceivePushResponse {
  @ApiProperty({ type: [ReceivedBuild] })
  readonly builds: ReceivedBuild[]

  constructor(started: StartedBuild[]) {
    this.builds = started.map((entry) => new ReceivedBuild(entry))
  }
}
