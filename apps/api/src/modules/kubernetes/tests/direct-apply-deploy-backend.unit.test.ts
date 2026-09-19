import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  ApiException,
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  type V1Status,
} from '@kubernetes/client-node'
import { expect } from 'expect'
import {
  createSandbox,
  createStubInstance,
  type SinonSandbox,
  type SinonStubbedInstance,
} from 'sinon'
import {
  OPERATOR_APPS_NAMESPACE,
  REGISTRY_SECRET_SUFFIX,
  RELEASE_UUID_ANNOTATION,
} from '#src/modules/kubernetes/deploy-backend.constants.js'
import type { RenderedManifests } from '#src/modules/kubernetes/deploy-backend.types.js'
import { DirectApplyDeployBackend } from '#src/modules/kubernetes/direct-apply-deploy-backend.js'

const SLUG = 'billing-api'

function manifests(overrides: Partial<RenderedManifests> = {}): RenderedManifests {
  return {
    deployment: { metadata: { name: SLUG } },
    service: { metadata: { name: SLUG } },
    ingressRoute: { metadata: { name: SLUG }, spec: { entryPoints: [], routes: [] } },
    httpScaledObject: {
      metadata: { name: SLUG },
      spec: {
        hosts: [],
        scaleTargetRef: {
          name: SLUG,
          kind: 'Deployment',
          apiVersion: 'apps/v1',
          service: SLUG,
          port: 80,
        },
        replicas: { min: 1, max: 1 },
        scaledownPeriod: 300,
      },
    },
    ...overrides,
  }
}

describe('DirectApplyDeployBackend.apply', () => {
  let apps: SinonStubbedInstance<AppsV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let custom: SinonStubbedInstance<CustomObjectsApi>
  let sandbox: SinonSandbox
  let backend: DirectApplyDeployBackend

  beforeEach(() => {
    apps = createStubInstance(AppsV1Api)
    core = createStubInstance(CoreV1Api)
    custom = createStubInstance(CustomObjectsApi)

    sandbox = createSandbox()
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .withArgs(AppsV1Api)
      .returns(apps)
      .withArgs(CoreV1Api)
      .returns(core)
      .withArgs(CustomObjectsApi)
      .returns(custom)

    backend = new DirectApplyDeployBackend()
  })

  afterEach(() => {
    sandbox.restore()
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

    // HTTPScaledObject then IngressRoute — apply got past the tolerated 404.
    expect(custom.patchNamespacedCustomObject.calledTwice).toBe(true)
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

describe('DirectApplyDeployBackend.readLiveReleaseUuid', () => {
  let apps: SinonStubbedInstance<AppsV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let custom: SinonStubbedInstance<CustomObjectsApi>
  let sandbox: SinonSandbox
  let backend: DirectApplyDeployBackend

  beforeEach(() => {
    apps = createStubInstance(AppsV1Api)
    core = createStubInstance(CoreV1Api)
    custom = createStubInstance(CustomObjectsApi)

    sandbox = createSandbox()
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .withArgs(AppsV1Api)
      .returns(apps)
      .withArgs(CoreV1Api)
      .returns(core)
      .withArgs(CustomObjectsApi)
      .returns(custom)

    backend = new DirectApplyDeployBackend()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('returns the release uuid stamped on the live pod template', async () => {
    apps.readNamespacedDeployment.resolves({
      spec: {
        selector: {},
        template: { metadata: { annotations: { [RELEASE_UUID_ANNOTATION]: 'r-1' } } },
      },
    })

    expect(await backend.readLiveReleaseUuid(OPERATOR_APPS_NAMESPACE, SLUG)).toBe('r-1')
  })

  it('returns null when the Deployment does not exist', async () => {
    apps.readNamespacedDeployment.rejects(new ApiException(404, 'Not Found', {}, {}))

    expect(await backend.readLiveReleaseUuid(OPERATOR_APPS_NAMESPACE, SLUG)).toBeNull()
  })
})
