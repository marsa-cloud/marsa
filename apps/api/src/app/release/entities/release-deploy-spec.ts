import { nodePinSpecOf } from '#src/app/app-management/entities/node-pin.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { type AppDeploySpec, type RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

export interface DeploySpecOptions {
  baseDomain: string
  credentials?: RegistryCredentials
}

// The pin is placement, not config: it comes from the app today, never from the release.
export function deploySpecOf(
  placement: AppPlacement,
  release: Release,
  { baseDomain, credentials }: DeploySpecOptions,
): AppDeploySpec {
  const { app } = placement
  return {
    releaseUuid: release.uuid,
    image: release.imageRef,
    port: release.containerPort,
    env: release.env,
    minReplicas: release.minReplicas,
    maxReplicas: release.maxReplicas,
    host: `${app.slug}.${baseDomain}`,
    nodePin: nodePinSpecOf(app.nodePin),
    ...(credentials ? { credentials } : {}),
  }
}
