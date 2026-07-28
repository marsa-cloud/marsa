import { ApiProperty } from '@nestjs/swagger'
import type { RunLogs } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * Run-log snapshot for an app (#114). `podName` is `null` — and `logs` empty —
 * when the app's Deployment or its pods can't be found, mirroring how
 * `get-app-health` folds "not found" into a 200 body rather than a 404.
 */
export class ViewAppLogsResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'my-app-7d9c8b6f5-abcde',
    description: 'Pod the log was read from; null when no pod was found.',
  })
  readonly podName: string | null

  @ApiProperty({ type: String, example: 'Listening on :8080\n' })
  readonly logs: string

  constructor(result: RunLogs | null) {
    this.podName = result?.podName ?? null
    this.logs = result?.logs ?? ''
  }
}
