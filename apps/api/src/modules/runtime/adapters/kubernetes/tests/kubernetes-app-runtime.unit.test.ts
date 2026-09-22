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
  REGISTRY_SECRET_SUFFIX,
  RELEASE_UUID_ANNOTATION,
} from '#src/modules/runtime/adapters/kubernetes/app/app.constants.js'
import { KubernetesAppRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-app-runtime.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { InvalidReleaseAnnotationError } from '#src/modules/runtime/runtime.errors.js'
import type { AppDeploySpec, AppRef } from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const SLUG = 'billing-api'
const NAMESPACE = 'demo-dev'

const APP: AppRef = {
  environment: {
    uuid: generateUuid<Uuid<'Environment'>>(),
    projectSlug: 'demo',
    environmentSlug: 'dev',
  },
  slug: SLUG,
}

const spec = (overrides: Partial<AppDeploySpec> = {}): AppDeploySpec => ({
  releaseUuid: generateUuid<Uuid<'Release'>>(),
  image: 'nginx:1.27',
  port: 80,
  env: {},
  minReplicas: 1,
  maxReplicas: 1,
  host: `${SLUG}.demo.marsa.cc`,
  nodePin: null,
  ...overrides,
})

const CREDENTIALS = { registry: 'ghcr.io', username: 'org', password: 'pw' }

describe('KubernetesAppRuntime.deploy', () => {
  let apps: SinonStubbedInstance<AppsV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let custom: SinonStubbedInstance<CustomObjectsApi>
  let sandbox: SinonSandbox
  let runtime: KubernetesAppRuntime
  let environments: SinonStubbedInstance<MockEnvironmentRuntime>

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

    environments = createStubInstance(MockEnvironmentRuntime)
    environments.provision.resolves()
    runtime = new KubernetesAppRuntime(environments)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('deletes the orphaned pull Secret when the bundle renders none', async () => {
    await runtime.deploy(APP, spec())

    expect(core.patchNamespacedSecret.called).toBe(false)
    expect(core.deleteNamespacedSecret.calledOnce).toBe(true)
    expect(core.deleteNamespacedSecret.firstCall.args[0]).toEqual({
      name: `${SLUG}${REGISTRY_SECRET_SUFFIX}`,
      namespace: NAMESPACE,
    })
  })

  it('deletes the Secret only after the Deployment has stopped referencing it', async () => {
    let deploymentPatchedFirst = false
    core.deleteNamespacedSecret.callsFake(() => {
      deploymentPatchedFirst = apps.patchNamespacedDeployment.called
      return Promise.resolve({} as V1Status)
    })

    await runtime.deploy(APP, spec())

    expect(deploymentPatchedFirst).toBe(true)
  })

  it('tolerates a 404 when no Secret was ever materialized', async () => {
    core.deleteNamespacedSecret.rejects(new ApiException(404, 'Not Found', {}, {}))

    await runtime.deploy(APP, spec())

    // HTTPScaledObject then IngressRoute — apply got past the tolerated 404.
    expect(custom.patchNamespacedCustomObject.calledTwice).toBe(true)
  })

  it('propagates a non-404 failure from the delete', async () => {
    core.deleteNamespacedSecret.rejects(new ApiException(403, 'Forbidden', {}, {}))

    await expect(runtime.deploy(APP, spec())).rejects.toThrow(ApiException)
  })

  it('applies the pull Secret and deletes nothing when the image stays private', async () => {
    await runtime.deploy(APP, spec({ credentials: CREDENTIALS }))

    expect(core.patchNamespacedSecret.calledOnce).toBe(true)
    expect(core.deleteNamespacedSecret.called).toBe(false)
  })

  it('provisions the environment before applying anything into it', async () => {
    await runtime.deploy(APP, spec())

    expect(environments.provision.calledOnceWithExactly(APP.environment)).toBe(true)
    expect(
      environments.provision.firstCall.calledBefore(apps.patchNamespacedDeployment.firstCall),
    ).toBe(true)
  })
})

describe('KubernetesAppRuntime.readLiveReleaseUuid', () => {
  let apps: SinonStubbedInstance<AppsV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let custom: SinonStubbedInstance<CustomObjectsApi>
  let sandbox: SinonSandbox
  let runtime: KubernetesAppRuntime
  let environments: SinonStubbedInstance<MockEnvironmentRuntime>

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

    environments = createStubInstance(MockEnvironmentRuntime)
    environments.provision.resolves()
    runtime = new KubernetesAppRuntime(environments)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('returns the release uuid stamped on the live pod template', async () => {
    const releaseUuid = generateUuid<Uuid<'Release'>>()
    apps.readNamespacedDeployment.resolves({
      spec: {
        selector: {},
        template: { metadata: { annotations: { [RELEASE_UUID_ANNOTATION]: releaseUuid } } },
      },
    })

    expect(await runtime.readLiveReleaseUuid(APP)).toBe(releaseUuid)
  })

  it('rejects a malformed annotation rather than returning it', async () => {
    apps.readNamespacedDeployment.resolves({
      spec: {
        selector: {},
        template: { metadata: { annotations: { [RELEASE_UUID_ANNOTATION]: 'r-1' } } },
      },
    })

    await expect(runtime.readLiveReleaseUuid(APP)).rejects.toThrow(InvalidReleaseAnnotationError)
  })

  it('returns null when the Deployment does not exist', async () => {
    apps.readNamespacedDeployment.rejects(new ApiException(404, 'Not Found', {}, {}))

    expect(await runtime.readLiveReleaseUuid(APP)).toBeNull()
  })
})
