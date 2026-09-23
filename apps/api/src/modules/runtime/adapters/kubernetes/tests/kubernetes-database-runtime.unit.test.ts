import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  ApiException,
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
} from '@kubernetes/client-node'
import { expect } from 'expect'
import {
  createSandbox,
  createStubInstance,
  type SinonSandbox,
  type SinonStubbedInstance,
} from 'sinon'
import { KubernetesDatabaseRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-database-runtime.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import {
  type DatabaseDeploySpec,
  type DatabaseRef,
  DatabaseStatus,
} from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const SLUG = 'orders'
const NAMESPACE = 'demo-dev'

const DATABASE: DatabaseRef = {
  project: { slug: 'demo' },
  environment: { uuid: generateUuid<Uuid<'Environment'>>(), slug: 'dev' },
  database: { slug: SLUG },
}

const spec = (): DatabaseDeploySpec => ({
  image: 'postgres:17.11',
  port: 5432,
  dataMountPath: '/var/lib/postgresql/data',
  env: { PGDATA: '/var/lib/postgresql/data/pgdata' },
  credentialEnv: [{ name: 'POSTGRES_PASSWORD', key: 'PGPASSWORD' }],
  publishedVariables: {
    DATABASE_URL: 'postgres://postgres:pw@orders:5432/orders',
    PGHOST: 'orders',
    PGPORT: '5432',
    PGUSER: 'postgres',
    PGPASSWORD: 'pw',
    PGDATABASE: 'orders',
  },
  storageGib: 10,
  storageClass: 'local-path',
  readinessExec: ['pg_isready', '-U', 'postgres'],
  nodePin: null,
})

describe('KubernetesDatabaseRuntime', () => {
  let apps: SinonStubbedInstance<AppsV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let sandbox: SinonSandbox
  let environments: SinonStubbedInstance<MockEnvironmentRuntime>
  let runtime: KubernetesDatabaseRuntime

  beforeEach(() => {
    apps = createStubInstance(AppsV1Api)
    core = createStubInstance(CoreV1Api)
    sandbox = createSandbox()
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .withArgs(AppsV1Api)
      .returns(apps)
      .withArgs(CoreV1Api)
      .returns(core)
    environments = createStubInstance(MockEnvironmentRuntime)
    environments.provision.resolves()
    runtime = new KubernetesDatabaseRuntime(environments)
  })

  afterEach(() => sandbox.restore())

  it('provisions the environment, then the Secret, then the StatefulSet', async () => {
    await runtime.provision(DATABASE, spec())

    expect(environments.provision.calledOnceWithExactly(DATABASE)).toBe(true)
    expect(core.patchNamespacedSecret.calledOnce).toBe(true)
    expect(core.patchNamespacedSecret.firstCall.args[0].namespace).toBe(NAMESPACE)
    expect(core.patchNamespacedSecret.firstCall.args[0].name).toBe(`${SLUG}-credentials`)
    expect(
      core.patchNamespacedSecret.firstCall.calledBefore(apps.patchNamespacedStatefulSet.firstCall),
    ).toBe(true)
    expect(
      environments.provision.firstCall.calledBefore(core.patchNamespacedSecret.firstCall),
    ).toBe(true)
  })

  it('names the credentials Secret the container reads its password from', async () => {
    await runtime.provision(DATABASE, spec())

    const body = apps.patchNamespacedStatefulSet.firstCall.args[0].body
    expect(body.spec?.template.spec?.containers[0]?.env).toEqual([
      { name: 'PGDATA', value: '/var/lib/postgresql/data/pgdata' },
      {
        name: 'POSTGRES_PASSWORD',
        valueFrom: { secretKeyRef: { name: `${SLUG}-credentials`, key: 'PGPASSWORD' } },
      },
    ])
  })

  it('deletes the StatefulSet, Service, Secret and PVC on destroy', async () => {
    await runtime.destroy(DATABASE)

    expect(apps.deleteNamespacedStatefulSet.calledOnce).toBe(true)
    expect(core.deleteNamespacedService.calledOnce).toBe(true)
    expect(core.deleteNamespacedSecret.calledOnce).toBe(true)
    expect(core.deleteNamespacedPersistentVolumeClaim.firstCall.args[0]).toEqual({
      name: `data-${SLUG}-0`,
      namespace: NAMESPACE,
    })
  })

  it('tolerates a 404 from any teardown step so a retry can finish', async () => {
    apps.deleteNamespacedStatefulSet.rejects(new ApiException(404, 'Not Found', {}, {}))
    core.deleteNamespacedService.rejects(new ApiException(404, 'Not Found', {}, {}))
    core.deleteNamespacedSecret.resolves({})
    core.deleteNamespacedPersistentVolumeClaim.rejects(new ApiException(404, 'Not Found', {}, {}))

    await runtime.destroy(DATABASE)

    expect(core.deleteNamespacedSecret.calledOnce).toBe(true)
  })

  it('propagates a non-404 teardown failure', async () => {
    apps.deleteNamespacedStatefulSet.rejects(new ApiException(403, 'Forbidden', {}, {}))

    await expect(runtime.destroy(DATABASE)).rejects.toThrow(ApiException)
  })

  it('reports not-found when the StatefulSet does not exist', async () => {
    apps.readNamespacedStatefulSet.rejects(new ApiException(404, 'Not Found', {}, {}))

    expect(await runtime.readStatus(DATABASE)).toBe(DatabaseStatus.NotFound)
    expect(core.listNamespacedPod.called).toBe(false)
  })

  it('reports ready when the replica is ready', async () => {
    apps.readNamespacedStatefulSet.resolves({
      spec: { selector: { matchLabels: { app: SLUG } }, serviceName: SLUG, template: {} },
      status: { readyReplicas: 1, replicas: 1 },
    })
    core.listNamespacedPod.resolves({ items: [] })

    expect(await runtime.readStatus(DATABASE)).toBe(DatabaseStatus.Ready)
  })
})
