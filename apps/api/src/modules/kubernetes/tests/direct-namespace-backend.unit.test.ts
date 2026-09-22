import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  ApiException,
  CoreV1Api,
  KubeConfig,
  RbacAuthorizationV1Api,
  type V1Namespace,
} from '@kubernetes/client-node'
import { expect } from 'expect'
import {
  createSandbox,
  createStubInstance,
  type SinonSandbox,
  type SinonStubbedInstance,
} from 'sinon'
import { DirectNamespaceBackend } from '#src/modules/kubernetes/direct-namespace-backend.js'
import { NamespaceConflictError } from '#src/modules/kubernetes/namespace-backend.js'

const NS = 'demo-dev'
const ENV_UUID = '0190c3c0-0000-7000-8000-000000000001'

const conflict = () => new ApiException(409, 'Conflict', {}, {})
const notFound = () => new ApiException(404, 'Not Found', {}, {})

function namespace(labels: Record<string, string>, terminating = false): V1Namespace {
  return {
    metadata: {
      name: NS,
      labels,
      ...(terminating ? { deletionTimestamp: new Date() } : {}),
    },
  }
}

describe('DirectNamespaceBackend', () => {
  let core: SinonStubbedInstance<CoreV1Api>
  let rbac: SinonStubbedInstance<RbacAuthorizationV1Api>
  let sandbox: SinonSandbox
  let backend: DirectNamespaceBackend

  beforeEach(() => {
    core = createStubInstance(CoreV1Api)
    rbac = createStubInstance(RbacAuthorizationV1Api)
    sandbox = createSandbox()
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .withArgs(CoreV1Api)
      .returns(core)
      .withArgs(RbacAuthorizationV1Api)
      .returns(rbac)
    backend = new DirectNamespaceBackend('marsa')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('creates a labelled namespace and binds the deployer ClusterRole to marsa-api', async () => {
    await backend.provision(NS, ENV_UUID)

    expect(core.createNamespace.firstCall.args[0].body.metadata).toEqual({
      name: NS,
      labels: { 'marsa.cloud/managed-by': 'marsa-api', 'marsa.cloud/environment-uuid': ENV_UUID },
    })
    const { namespace, body } = rbac.createNamespacedRoleBinding.firstCall.args[0]
    expect(namespace).toBe(NS)
    expect(body.roleRef).toEqual({
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'marsa-deployer',
    })
    expect(body.subjects).toEqual([
      { kind: 'ServiceAccount', name: 'marsa-api', namespace: 'marsa' },
    ])
  })

  it('treats a namespace it already owns as provisioned', async () => {
    core.createNamespace.rejects(conflict())
    core.readNamespace.resolves(namespace({ 'marsa.cloud/environment-uuid': ENV_UUID }))
    rbac.createNamespacedRoleBinding.rejects(conflict())

    await backend.provision(NS, ENV_UUID)
  })

  it('refuses a namespace owned by anything else', async () => {
    core.createNamespace.rejects(conflict())
    core.readNamespace.resolves(namespace({}))

    await expect(backend.provision(NS, ENV_UUID)).rejects.toThrow(NamespaceConflictError)
    expect(rbac.createNamespacedRoleBinding.called).toBe(false)
  })

  it('refuses a namespace that is still terminating', async () => {
    core.createNamespace.rejects(conflict())
    core.readNamespace.resolves(namespace({ 'marsa.cloud/environment-uuid': ENV_UUID }, true))

    await expect(backend.provision(NS, ENV_UUID)).rejects.toThrow(/still being deleted/)
  })

  it('rethrows any other create failure', async () => {
    core.createNamespace.rejects(new ApiException(403, 'Forbidden', {}, {}))

    await expect(backend.provision(NS, ENV_UUID)).rejects.toThrow(ApiException)
  })

  it('deletes a namespace labelled for this environment', async () => {
    core.readNamespace.resolves(namespace({ 'marsa.cloud/environment-uuid': ENV_UUID }))

    await backend.destroy(NS, ENV_UUID)

    expect(core.deleteNamespace.calledOnceWith({ name: NS })).toBe(true)
  })

  it('treats an already-missing namespace as done', async () => {
    core.readNamespace.rejects(notFound())

    await backend.destroy(NS, ENV_UUID)

    expect(core.deleteNamespace.called).toBe(false)
  })

  it('never deletes a namespace another environment owns', async () => {
    core.readNamespace.resolves(namespace({ 'marsa.cloud/environment-uuid': 'someone-else' }))

    await backend.destroy(NS, ENV_UUID)

    expect(core.deleteNamespace.called).toBe(false)
  })
})
