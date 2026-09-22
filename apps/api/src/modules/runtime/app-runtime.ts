import type {
  AppDeploySpec,
  AppHealth,
  AppRef,
  DeployFailure,
  RolloutStatus,
  RunLogs,
  RunLogsOptions,
} from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

export abstract class AppRuntime {
  // Provisions the app's environment too, so a hand-deleted one is healed on the next deploy.
  abstract deploy(app: AppRef, spec: AppDeploySpec): Promise<void>

  // Idempotent: a retry after a partial teardown still completes.
  abstract destroy(app: AppRef): Promise<void>

  abstract readRolloutStatus(app: AppRef): Promise<RolloutStatus>

  // Null when nothing is deployed; InvalidReleaseAnnotationError when the marker is malformed.
  abstract readLiveReleaseUuid(app: AppRef): Promise<Uuid<'Release'> | null>

  abstract readHealth(app: AppRef): Promise<AppHealth>

  abstract readDeployFailure(app: AppRef): Promise<DeployFailure | null>

  abstract readRunLogs(app: AppRef, options: RunLogsOptions): Promise<RunLogs | null>
}
