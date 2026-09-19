import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'

// Derived, never stored (AgDR-0029).
export function namespaceOf(
  project: Pick<Project, 'slug'>,
  environment: Pick<Environment, 'slug'>,
): string {
  return `${project.slug}-${environment.slug}`
}
