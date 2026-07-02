import {
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
} from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'

import {
  DEPLOY_FIELD_MANAGER,
  INGRESS_ROUTE_PLURAL,
  TRAEFIK_GROUP,
  TRAEFIK_VERSION,
} from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RenderedManifests } from '#src/modules/kubernetes/deploy-backend.types.js'

function requireName(object: { metadata?: { name?: string } }, kind: string): string {
  const name = object.metadata?.name
  if (!name) {
    throw new Error(`rendered ${kind} manifest is missing metadata.name`)
  }
  return name
}

@Injectable()
export class DirectApplyDeployBackend extends DeployBackend {
  private readonly apps: AppsV1Api
  private readonly core: CoreV1Api
  private readonly custom: CustomObjectsApi

  constructor() {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.apps = kc.makeApiClient(AppsV1Api)
    this.core = kc.makeApiClient(CoreV1Api)
    this.custom = kc.makeApiClient(CustomObjectsApi)
  }

  async apply(namespace: string, manifests: RenderedManifests): Promise<void> {
    const { deployment, service, ingressRoute } = manifests
    const ssa = setHeaderOptions('Content-Type', PatchStrategy.ServerSideApply)

    await this.apps.patchNamespacedDeployment(
      {
        name: requireName(deployment, 'Deployment'),
        namespace,
        body: deployment,
        fieldManager: DEPLOY_FIELD_MANAGER,
        force: true,
      },
      ssa,
    )

    await this.core.patchNamespacedService(
      {
        name: requireName(service, 'Service'),
        namespace,
        body: service,
        fieldManager: DEPLOY_FIELD_MANAGER,
        force: true,
      },
      ssa,
    )

    await this.custom.patchNamespacedCustomObject(
      {
        group: TRAEFIK_GROUP,
        version: TRAEFIK_VERSION,
        namespace,
        plural: INGRESS_ROUTE_PLURAL,
        name: requireName(ingressRoute, 'IngressRoute'),
        body: ingressRoute,
        fieldManager: DEPLOY_FIELD_MANAGER,
        force: true,
      },
      ssa,
    )
  }
}
