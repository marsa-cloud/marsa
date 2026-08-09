import { beforeEach, describe, it } from 'node:test'
import {
  ApiException,
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  type V1Status,
} from '@kubernetes/client-node'
import { expect } from 'expect'
import { createStubInstance, type SinonStubbedInstance } from 'sinon'
import {
  OPERATOR_APPS_NAMESPACE,
  REGISTRY_SECRET_SUFFIX,
} from '#src/modules/kubernetes/deploy-backend.constants.js'
import type { RenderedManifests } from '#src/modules/kubernetes/deploy-backend.types.js'
import { DirectApplyDeployBackend } from '#src/modules/kubernetes/direct-apply-deploy-backend.js'

const SLUG = 'billing-api'

function manifests(overrides: Partial<RenderedManifests> = {}): RenderedManifests {
  return {
    deployment: { metadata: { name: SLUG } },
    service: { metadata: { name: SLUG } },
    ingressRoute: { metadata: { name: SLUG }, spec: { entryPoints: [], routes: [] } },
    ...overrides,
  }
}

describe('DirectApplyDeployBackend.apply', () => {
  let apps: SinonStubbedInstance<AppsV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let custom: SinonStubbedInstance<CustomObjectsApi>
  let backend: DirectApplyDeployBackend

  beforeEach(() => {
    apps = createStubInstance(AppsV1Api)
    core = createStubInstance(CoreV1Api)
    custom = createStubInstance(CustomObjectsApi)

    const kubeConfig = createStubInstance(KubeConfig)
    kubeConfig.makeApiClient.withArgs(AppsV1Api).returns(apps)
    kubeConfig.makeApiClient.withArgs(CoreV1Api).returns(core)
    kubeConfig.makeApiClient.withArgs(CustomObjectsApi).returns(custom)

    backend = new DirectApplyDeployBackend(kubeConfig)
  })

  it('deletes the orphaned pull Secret when the bundle renders none', async () => {
    await backend.apply(OPERATOR_APPS_NAMESPACE, manifests())

    expect(core.patchNamespacedSecret.called).toBe(false)
    expect(core.deleteNamespacedSecret.calledOnce).toBe(true)
    expect(core.deleteNamespacedSecret.firstCall.args[0]).toEqual({
      name: `${SLUG}${REGISTRY_SECRET_SUFFIX}`,
      namespace: OPERATOR_APPS_NAMESPACE,
    })
  })

  it('deletes the Secret only after the Deployment has stopped referencing it', async () => {
    let deploymentPatchedFirst = false
    core.deleteNamespacedSecret.callsFake(() => {
      deploymentPatchedFirst = apps.patchNamespacedDeployment.called
      return Promise.resolve({} as V1Status)
    })

    await backend.apply(OPERATOR_APPS_NAMESPACE, manifests())

    expect(deploymentPatchedFirst).toBe(true)
  })

  it('tolerates a 404 when no Secret was ever materialized', async () => {
    core.deleteNamespacedSecret.rejects(new ApiException(404, 'Not Found', {}, {}))

    await backend.apply(OPERATOR_APPS_NAMESPACE, manifests())

    expect(custom.patchNamespacedCustomObject.calledOnce).toBe(true)
  })

  it('propagates a non-404 failure from the delete', async () => {
    core.deleteNamespacedSecret.rejects(new ApiException(403, 'Forbidden', {}, {}))

    await expect(backend.apply(OPERATOR_APPS_NAMESPACE, manifests())).rejects.toThrow(ApiException)
  })

  it('applies the pull Secret and deletes nothing when the image stays private', async () => {
    const imagePullSecret = { metadata: { name: `${SLUG}${REGISTRY_SECRET_SUFFIX}` } }

    await backend.apply(OPERATOR_APPS_NAMESPACE, manifests({ imagePullSecret }))

    expect(core.patchNamespacedSecret.calledOnce).toBe(true)
    expect(core.deleteNamespacedSecret.called).toBe(false)
  })
})
