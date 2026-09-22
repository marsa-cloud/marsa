import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

export abstract class EnvironmentRuntime {
  // Idempotent for the same environment uuid; EnvironmentConflictError otherwise.
  abstract provision(environment: EnvironmentRef): Promise<void>

  // Only removes what this environment owns; a missing or foreign one is left alone.
  abstract destroy(environment: EnvironmentRef): Promise<void>
}
