import {
  CoreV1Api,
  KubeConfig,
  RbacAuthorizationV1Api,
  type V1Namespace,
  type V1RoleBinding,
} from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { ignoreConflict, isConflict } from '#src/modules/kubernetes/conflict.js'
import {
  API_SERVICE_ACCOUNT,
  DEPLOYER_CLUSTER_ROLE,
  DEPLOYER_ROLE_BINDING,
  ENVIRONMENT_UUID_LABEL,
  MANAGED_BY_LABEL,
  MANAGED_BY_VALUE,
} from '#src/modules/kubernetes/namespace-backend.constants.js'
import {
  NamespaceBackend,
  NamespaceConflictError,
} from '#src/modules/kubernetes/namespace-backend.js'
import { ignoreNotFound, isNotFound } from '#src/modules/kubernetes/not-found.js'

@Injectable()
export class DirectNamespaceBackend extends NamespaceBackend {
  private readonly core: CoreV1Api
  private readonly rbac: RbacAuthorizationV1Api

  constructor(private readonly apiNamespace: string) {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.core = kc.makeApiClient(CoreV1Api)
    this.rbac = kc.makeApiClient(RbacAuthorizationV1Api)
  }

  async provision(namespace: string, environmentUuid: string): Promise<void> {
    await this.ensureNamespace(namespace, environmentUuid)
    await ignoreConflict(() =>
      this.rbac.createNamespacedRoleBinding({ namespace, body: this.deployerBinding(namespace) }),
    )
  }

  // Slugs may contain '-', so two environments can derive one name; never delete the other's.
  async destroy(namespace: string, environmentUuid: string): Promise<void> {
    let existing: V1Namespace
    try {
      existing = await this.core.readNamespace({ name: namespace })
    } catch (error) {
      if (isNotFound(error)) {
        return
      }
      throw error
    }
    if (existing.metadata?.labels?.[ENVIRONMENT_UUID_LABEL] !== environmentUuid) {
      return
    }
    await ignoreNotFound(() => this.core.deleteNamespace({ name: namespace }))
  }

  private async ensureNamespace(name: string, environmentUuid: string): Promise<void> {
    try {
      await this.core.createNamespace({
        body: {
          metadata: {
            name,
            labels: {
              [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
              [ENVIRONMENT_UUID_LABEL]: environmentUuid,
            },
          },
        },
      })
      return
    } catch (error) {
      if (!isConflict(error)) {
        throw error
      }
    }

    const existing = await this.core.readNamespace({ name })
    if (existing.metadata?.deletionTimestamp) {
      throw new NamespaceConflictError(`Namespace '${name}' is still being deleted. Retry shortly.`)
    }
    if (existing.metadata?.labels?.[ENVIRONMENT_UUID_LABEL] !== environmentUuid) {
      throw new NamespaceConflictError(
        `Namespace '${name}' is already taken. Choose a different project or environment slug.`,
      )
    }
  }

  private deployerBinding(namespace: string): V1RoleBinding {
    return {
      metadata: {
        name: DEPLOYER_ROLE_BINDING,
        namespace,
        labels: { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE },
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: DEPLOYER_CLUSTER_ROLE,
      },
      subjects: [
        { kind: 'ServiceAccount', name: API_SERVICE_ACCOUNT, namespace: this.apiNamespace },
      ],
    }
  }
}
