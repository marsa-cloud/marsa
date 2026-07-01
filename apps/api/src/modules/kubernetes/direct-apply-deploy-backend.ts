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

/**
 * Applies the manifest bundle directly to the cluster via Kubernetes
 * server-side apply (AgDR-0032). Each object is applied with a fixed field
 * manager and `force: true`, so first-deploy and re-deploy (#100) are the same
 * call — no exists-check, no `clusterIP` salvage. `loadFromDefault()` resolves
 * the in-cluster service account in prod and `~/.kube/config` locally
 * (AgDR-0031).
 */
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
        name: deployment.metadata!.name!,
        namespace,
        body: deployment,
        fieldManager: DEPLOY_FIELD_MANAGER,
        force: true,
      },
      ssa,
    )

    await this.core.patchNamespacedService(
      {
        name: service.metadata!.name!,
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
        name: ingressRoute.metadata!.name!,
        body: ingressRoute,
        fieldManager: DEPLOY_FIELD_MANAGER,
        force: true,
      },
      ssa,
    )
  }
}
