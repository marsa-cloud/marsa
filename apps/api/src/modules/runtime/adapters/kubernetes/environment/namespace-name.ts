import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

// Derived, never stored (AgDR-0029).
export function namespaceOf({ project, environment }: EnvironmentRef): string {
  return `${project.slug}-${environment.slug}`
}
