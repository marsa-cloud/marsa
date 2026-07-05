import { ApiProperty } from '@nestjs/swagger'

import type { DeployEvent } from '#src/modules/kubernetes/deploy-backend.types.js'

/** The K8s object a rollout event is about (Deployment / ReplicaSet / Pod). */
export class DeployEventObject {
  @ApiProperty({ type: String, example: 'Deployment' })
  readonly kind: string

  @ApiProperty({ type: String, example: 'my-app' })
  readonly name: string

  constructor(kind: string, name: string) {
    this.kind = kind
    this.name = name
  }
}

/** One rollout event surfaced for an app (#115) — derived from a K8s Event, never stored. */
export class DeployEventDto {
  @ApiProperty({ type: String, example: 'Warning', description: '`Normal` or `Warning`.' })
  readonly type: string

  @ApiProperty({ type: String, example: 'BackOff' })
  readonly reason: string

  @ApiProperty({ type: String, example: 'Back-off restarting failed container' })
  readonly message: string

  @ApiProperty({ type: Number, example: 4 })
  readonly count: number

  @ApiProperty({ type: String, example: '2026-07-05T10:05:00.000Z' })
  readonly lastSeen: string

  @ApiProperty({ type: DeployEventObject })
  readonly involvedObject: DeployEventObject

  constructor(event: DeployEvent) {
    this.type = event.type
    this.reason = event.reason
    this.message = event.message
    this.count = event.count
    this.lastSeen = event.lastSeen
    this.involvedObject = new DeployEventObject(
      event.involvedObject.kind,
      event.involvedObject.name,
    )
  }
}

export class GetAppDeployEventsResponse {
  @ApiProperty({ type: [DeployEventDto] })
  readonly events: DeployEventDto[]

  constructor(events: DeployEvent[]) {
    this.events = events.map((event) => new DeployEventDto(event))
  }
}
