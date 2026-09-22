import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

export function environmentRefOf(
  project: Pick<Project, 'slug'>,
  environment: Pick<Environment, 'uuid' | 'slug'>,
): EnvironmentRef {
  return { uuid: environment.uuid, projectSlug: project.slug, environmentSlug: environment.slug }
}
