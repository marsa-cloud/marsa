import type { BuildObservation, BuildRef, BuildSpec } from '#src/modules/runtime/runtime.types.js'

export const BUILD_DEADLINE_SECONDS = 1800

export abstract class BuildRuntime {
  // Idempotent per build uuid.
  abstract start(build: BuildRef, spec: BuildSpec): Promise<void>

  // Idempotent: a build that is already gone counts as cancelled.
  abstract cancel(build: BuildRef): Promise<void>

  abstract readStatus(build: BuildRef): Promise<BuildObservation>

  // Null once the runtime no longer keeps the build's output.
  abstract readLogs(build: BuildRef): Promise<string | null>
}
