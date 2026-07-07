import {
  ApiException,
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
  type V1Deployment,
  type V1Pod,
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
  DeployFailure,
  RenderedManifests,
  RunLogs,
  RunLogsOptions,
} from '#src/modules/kubernetes/deploy-backend.types.js'
import { extractDeployFailure } from '#src/modules/kubernetes/extract-deploy-failure.js'
import { mapRolloutStatus } from '#src/modules/kubernetes/map-rollout-status.js'
import { newestPod } from '#src/modules/kubernetes/newest-pod.js'
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
    const { deployment, service, ingressRoute, imagePullSecret } = manifests
    const ssa = setHeaderOptions('Content-Type', PatchStrategy.ServerSideApply)

    // The pull Secret must exist before the Deployment's pods schedule, or the
    // first pull races ahead of its credentials (#99).
    if (imagePullSecret) {
      await this.core.patchNamespacedSecret(
        {
          name: requireName(imagePullSecret, 'Secret'),
          namespace,
          body: imagePullSecret,
          fieldManager: DEPLOY_FIELD_MANAGER,
          force: true,
        },
        ssa,
      )
    }

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

  async readDeployFailure(
    namespace: string,
    deploymentName: string,
  ): Promise<DeployFailure | null> {
    const pods = await this.listAppPods(namespace, deploymentName)
    return extractDeployFailure(pods)
  }

  async readRunLogs(
    namespace: string,
    deploymentName: string,
    options: RunLogsOptions,
  ): Promise<RunLogs | null> {
    const pods = await this.listAppPods(namespace, deploymentName)
    // Newest pod reflects the current rollout; aggregating across replicas is
    // out of scope for V0.1 (#114).
    const pod = newestPod(pods)
    const name = pod?.metadata?.name
    if (!name) {
      return null
    }

    try {
      const logs = await this.core.readNamespacedPodLog({
        name,
        namespace,
        tailLines: options.tailLines,
      })
      return { podName: name, logs }
    } catch (error) {
      // The pod can vanish between the list and this read (eviction, rollout
      // churn); a 404 here is the same "not found → null" case, not a failure.
      if (isNotFound(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * Pods owned by an app's Deployment, selected by the Deployment's own
   * `matchLabels` — no name-prefix guessing, no sibling bleed. Empty when the
   * Deployment (or a usable selector) can't be found.
   */
  private async listAppPods(namespace: string, deploymentName: string): Promise<V1Pod[]> {
    const deployment = await this.readDeployment(namespace, deploymentName)
    const matchLabels = deployment?.spec?.selector?.matchLabels
    if (!matchLabels || Object.keys(matchLabels).length === 0) {
      return []
    }

    const labelSelector = Object.entries(matchLabels)
      .map(([key, value]) => `${key}=${value}`)
      .join(',')
    const { items } = await this.core.listNamespacedPod({ namespace, labelSelector })
    return items
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
