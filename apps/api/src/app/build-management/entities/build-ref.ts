import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import type { BuildRef } from '#src/modules/runtime/runtime.types.js'

export function buildRefOf(appSlug: string, buildUuid: BuildUuid): BuildRef {
  return { build: { uuid: buildUuid }, app: { slug: appSlug } }
}
