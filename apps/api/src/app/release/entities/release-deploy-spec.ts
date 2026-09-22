import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { type AppPlacement, appRefOf } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import type {
  AppDeploySpec,
  AppRef,
  NodePinSpec,
  RegistryCredentials,
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
): { app: AppRef; spec: AppDeploySpec } {
  const { app } = placement
  return {
    app: appRefOf(placement),
    spec: {
      releaseUuid: release.uuid,
      image: release.imageRef,
      port: release.containerPort,
      env: release.env,
      minReplicas: release.minReplicas,
      maxReplicas: release.maxReplicas,
      host: `${app.slug}.${baseDomain}`,
      nodePin: nodePinSpecOf(app.nodePin),
      ...(credentials ? { credentials } : {}),
    },
  }
}

function nodePinSpecOf(nodePin: NodePin | null): NodePinSpec | null {
  if (!nodePin) {
    return null
  }
  const strategy = nodePin.strategy === PinStrategy.Required ? 'required' : 'preferred'
  return { key: nodePin.key, values: nodePin.values, strategy }
}
