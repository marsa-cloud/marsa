import type {
  BuildLogsOptions,
  BuildObservation,
  BuildRef,
  BuildSpec,
} from '#src/modules/runtime/runtime.types.js'

export const BUILD_DEADLINE_SECONDS = 1800

export abstract class BuildRuntime {
  // Idempotent per build uuid.
  abstract start(build: BuildRef, spec: BuildSpec): Promise<void>

  // Idempotent (a gone build counts as cancelled); resolves once the build can no longer push.
  abstract cancel(build: BuildRef): Promise<void>

  abstract readStatus(build: BuildRef): Promise<BuildObservation>

  // Null once the runtime no longer keeps the build's output.
  abstract readLogs(build: BuildRef, options: BuildLogsOptions): Promise<string | null>
}
