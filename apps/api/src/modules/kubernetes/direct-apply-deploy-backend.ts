import {
  ApiException,
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
  type V1Deployment,
} from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'

import {
  DEPLOY_FIELD_MANAGER,
  INGRESS_ROUTE_PLURAL,
  TRAEFIK_GROUP,
  TRAEFIK_VERSION,
} from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type {
  AppHealth,
  DeployEvent,
  RenderedManifests,
} from '#src/modules/kubernetes/deploy-backend.types.js'
import { mapDeployEvents } from '#src/modules/kubernetes/map-deploy-events.js'
import { mapRolloutStatus } from '#src/modules/kubernetes/map-rollout-status.js'
import { resolveRolloutObjectNames } from '#src/modules/kubernetes/resolve-rollout-object-names.js'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'

function isNotFound(error: unknown): boolean {
  return error instanceof ApiException && error.code === 404
}

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

  async readRolloutStatus(namespace: string, deploymentName: string): Promise<RolloutStatus> {
    const deployment = await this.readDeployment(namespace, deploymentName)
    return mapRolloutStatus(deployment)
  }

  async readAppHealth(namespace: string, deploymentName: string): Promise<AppHealth> {
    const deployment = await this.readDeployment(namespace, deploymentName)
    if (deployment === null) {
      return { found: false, desiredReplicas: 0, availableReplicas: 0, updatedReplicas: 0 }
    }
    const status = deployment.status
    return {
      found: true,
      desiredReplicas: deployment.spec?.replicas ?? 0,
      availableReplicas: status?.availableReplicas ?? 0,
      updatedReplicas: status?.updatedReplicas ?? 0,
    }
  }

  async readDeployEvents(namespace: string, deploymentName: string): Promise<DeployEvent[]> {
    const deployment = await this.readDeployment(namespace, deploymentName)
    if (deployment === null) {
      return []
    }

    // A rollout's events are spread across the Deployment, its current
    // ReplicaSet(s), and their Pods. Resolve that object set by ownerRef uid so a
    // sibling app that shares a name prefix can't bleed into these results, then
    // list the namespace's events once and keep only the relevant ones.
    const names = await this.collectRolloutObjectNames(namespace, deployment)
    const { items } = await this.core.listNamespacedEvent({ namespace })
    const relevant = items.filter((event) => names.has(event.involvedObject?.name ?? ''))
    return mapDeployEvents(relevant)
  }

  private async collectRolloutObjectNames(
    namespace: string,
    deployment: V1Deployment,
  ): Promise<Set<string>> {
    const [{ items: replicaSets }, { items: pods }] = await Promise.all([
      this.apps.listNamespacedReplicaSet({ namespace }),
      this.core.listNamespacedPod({ namespace }),
    ])
    return resolveRolloutObjectNames(deployment, replicaSets, pods)
  }

  private async readDeployment(
    namespace: string,
    deploymentName: string,
  ): Promise<V1Deployment | null> {
    try {
      return await this.apps.readNamespacedDeployment({ name: deploymentName, namespace })
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }
      throw error
    }
  }
}
