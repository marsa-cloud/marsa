import type { App } from '#src/app/app-management/entities/app.table.js'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import {
  type AppDeploySpec,
  type NodePinSpec,
  NodePinStrategy,
  type RegistryCredentials,
} from '#src/modules/runtime/runtime.types.js'

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
    env: envOf(app, release),
    minReplicas: release.minReplicas,
    maxReplicas: release.maxReplicas,
    host: `${app.slug}.${baseDomain}`,
    nodePin: nodePinSpecOf(app.nodePin),
    ...(credentials ? { credentials } : {}),
  }
}

const PORT_ENV = 'PORT'

// A built app can't know the port Marsa routes to unless told; a user-set PORT still wins.
function envOf(app: App, release: Release): Record<string, string> {
  if (!app.source || PORT_ENV in release.env) {
    return release.env
  }
  return { ...release.env, [PORT_ENV]: String(release.containerPort) }
}

function nodePinSpecOf(nodePin: NodePin | null): NodePinSpec | null {
  if (!nodePin) {
    return null
  }
  const strategy =
    nodePin.strategy === PinStrategy.Required ? NodePinStrategy.Required : NodePinStrategy.Preferred
  return { key: nodePin.key, values: nodePin.values, strategy }
}
