import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

// Derived, never stored (AgDR-0029).
export function namespaceOf({
  projectSlug,
  environmentSlug,
}: Pick<EnvironmentRef, 'projectSlug' | 'environmentSlug'>): string {
  return `${projectSlug}-${environmentSlug}`
}
