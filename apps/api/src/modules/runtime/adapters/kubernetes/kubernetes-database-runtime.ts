import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
  type V1Pod,
  type V1StatefulSet,
} from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { DEPLOY_FIELD_MANAGER } from '#src/modules/runtime/adapters/kubernetes/app/app.constants.js'
import { mapDatabaseStatus } from '#src/modules/runtime/adapters/kubernetes/database/map-database-status.js'
import {
  credentialsSecretName,
  renderCredentialsSecret,
} from '#src/modules/runtime/adapters/kubernetes/database/render-credentials-secret.js'
import { namespaceOf } from '#src/modules/runtime/adapters/kubernetes/environment/namespace-name.js'
import { DATA_VOLUME_NAME } from '#src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.constants.js'
import { renderPersistentWorkload } from '#src/modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.js'
import {
  ignoreNotFound,
  isNotFound,
} from '#src/modules/runtime/adapters/kubernetes/shared/not-found.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { type DatabaseStatus } from '#src/modules/runtime/runtime.enums.js'
import type { DatabaseDeploySpec, DatabaseRef } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class KubernetesDatabaseRuntime extends DatabaseRuntime {
  private readonly apps: AppsV1Api
  private readonly core: CoreV1Api

  constructor(private readonly environments: EnvironmentRuntime) {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.apps = kc.makeApiClient(AppsV1Api)
    this.core = kc.makeApiClient(CoreV1Api)
  }

  async provision(ref: DatabaseRef, spec: DatabaseDeploySpec): Promise<void> {
    await this.environments.provision(ref)

    const namespace = namespaceOf(ref)
    const name = ref.database.slug
    const secretName = credentialsSecretName(name)
    const ssa = setHeaderOptions('Content-Type', PatchStrategy.ServerSideApply)

    // Before the StatefulSet: the pod mounts these keys, so a pod that schedules ahead of
    // its Secret crash-loops on an empty password (#99).
    await this.core.patchNamespacedSecret(
      {
        name: secretName,
        namespace,
        body: renderCredentialsSecret(name, spec.publishedVariables),
        fieldManager: DEPLOY_FIELD_MANAGER,
        force: true,
      },
      ssa,
    )

    const { statefulSet, service } = renderPersistentWorkload({
      name,
      image: spec.image,
      port: spec.port,
      env: spec.env,
      secretEnv: spec.credentialEnv.map(({ name: envName, key }) => ({
        name: envName,
        secret: secretName,
        key,
      })),
      volume: {
        mountPath: spec.dataMountPath,
        sizeGib: spec.storageGib,
        storageClass: spec.storageClass,
      },
      readinessExec: spec.readinessExec,
      nodePin: spec.nodePin,
    })

    await this.apps.patchNamespacedStatefulSet(
      { name, namespace, body: statefulSet, fieldManager: DEPLOY_FIELD_MANAGER, force: true },
      ssa,
    )

    await this.core.patchNamespacedService(
      { name, namespace, body: service, fieldManager: DEPLOY_FIELD_MANAGER, force: true },
      ssa,
    )
  }

  async destroy(ref: DatabaseRef): Promise<void> {
    const namespace = namespaceOf(ref)
    const name = ref.database.slug

    await ignoreNotFound(() => this.apps.deleteNamespacedStatefulSet({ name, namespace }))
    await ignoreNotFound(() => this.core.deleteNamespacedService({ name, namespace }))
    await ignoreNotFound(() =>
      this.core.deleteNamespacedSecret({ name: credentialsSecretName(name), namespace }),
    )
    // The retention policy removes it with the StatefulSet; this covers a volume left behind by
    // an older policy or a partial teardown, so a 404 here is the normal case.
    await ignoreNotFound(() =>
      this.core.deleteNamespacedPersistentVolumeClaim({
        name: `${DATA_VOLUME_NAME}-${name}-0`,
        namespace,
      }),
    )
  }

  async readStatus(ref: DatabaseRef): Promise<DatabaseStatus> {
    const namespace = namespaceOf(ref)
    const statefulSet = await this.readStatefulSet(namespace, ref.database.slug)
    if (statefulSet === null) {
      return mapDatabaseStatus(null, [])
    }
    const pods = await this.listPods(namespace, ref.database.slug)
    return mapDatabaseStatus(statefulSet, pods)
  }

  private async listPods(namespace: string, name: string): Promise<V1Pod[]> {
    const { items } = await this.core.listNamespacedPod({
      namespace,
      labelSelector: `app=${name}`,
    })
    return items
  }

  private async readStatefulSet(namespace: string, name: string): Promise<V1StatefulSet | null> {
    try {
      return await this.apps.readNamespacedStatefulSet({ name, namespace })
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }
      throw error
    }
  }
}
