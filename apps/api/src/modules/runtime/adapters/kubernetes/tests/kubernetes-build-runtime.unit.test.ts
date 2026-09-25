import { afterEach, beforeEach, describe, it } from 'node:test'
import { ApiException, BatchV1Api, CoreV1Api, KubeConfig } from '@kubernetes/client-node'
import { expect } from 'expect'
import {
  createSandbox,
  createStubInstance,
  type SinonSandbox,
  type SinonStubbedInstance,
} from 'sinon'
import { KubernetesBuildRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-build-runtime.js'
import { type BuildRef, type BuildSpec, BuildState } from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

const UUID = '0190f0f0-0000-7000-8000-000000000002' as Uuid<'Build'>
const ref: BuildRef = { build: { uuid: UUID }, app: { slug: 'shop' } }
const spec: BuildSpec = {
  repoUrl: 'https://github.com/acme/shop.git',
  commitSha: 'c'.repeat(40),
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
  gitToken: 'ghs_y',
  pushRef: 'r:5000/shop:x',
}
const notFound = () => new ApiException(404, 'Not Found', {}, {})
const conflict = () => new ApiException(409, 'Conflict', {}, {})

describe('KubernetesBuildRuntime', () => {
  let sandbox: SinonSandbox
  let batch: SinonStubbedInstance<BatchV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let runtime: KubernetesBuildRuntime

  beforeEach(() => {
    batch = createStubInstance(BatchV1Api)
    core = createStubInstance(CoreV1Api)
    sandbox = createSandbox()
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .withArgs(BatchV1Api)
      .returns(batch)
      .withArgs(CoreV1Api)
      .returns(core)
    runtime = new KubernetesBuildRuntime()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('creates the job, then the token secret owned by it', async () => {
    batch.createNamespacedJob.resolves({ metadata: { name: `build-${UUID}`, uid: 'uid-1' } })
    core.createNamespacedSecret.resolves({})

    await runtime.start(ref, spec)

    expect(batch.createNamespacedJob.firstCall.args[0].namespace).toBe('marsa-builds')
    const secret = core.createNamespacedSecret.firstCall.args[0].body
    expect(secret.metadata?.ownerReferences?.[0]).toMatchObject({ kind: 'Job', uid: 'uid-1' })
  })

  it('treats a job that already exists as started', async () => {
    batch.createNamespacedJob.rejects(conflict())
    batch.readNamespacedJob.resolves({ metadata: { name: `build-${UUID}`, uid: 'uid-1' } })
    core.createNamespacedSecret.rejects(conflict())

    await expect(runtime.start(ref, spec)).resolves.toBeUndefined()
  })

  it('deletes the job in the background on cancel and ignores a missing one', async () => {
    batch.deleteNamespacedJob.rejects(notFound())

    await runtime.cancel(ref)

    expect(batch.deleteNamespacedJob.firstCall.args[0]).toMatchObject({
      name: `build-${UUID}`,
      namespace: 'marsa-builds',
      propagationPolicy: 'Background',
    })
  })

  it('reads a missing job as not found', async () => {
    batch.readNamespacedJob.rejects(notFound())

    expect(await runtime.readStatus(ref)).toEqual({ state: BuildState.NotFound })
  })

  it('maps the job and its pods', async () => {
    batch.readNamespacedJob.resolves({
      status: { conditions: [{ type: 'Complete', status: 'True' }] },
    })
    core.listNamespacedPod.resolves({ items: [] })

    expect(await runtime.readStatus(ref)).toEqual({ state: BuildState.Succeeded })
  })

  it('reads the build pod log and returns null when the pod is gone', async () => {
    core.listNamespacedPod.resolves({ items: [{ metadata: { name: 'p-1' } }] })
    core.readNamespacedPodLog.resolves('#1 DONE')

    expect(await runtime.readLogs(ref, { tailLines: 50 })).toBe('#1 DONE')
    expect(core.listNamespacedPod.firstCall.args[0].labelSelector).toBe(
      `batch.kubernetes.io/job-name=build-${UUID}`,
    )
    expect(core.readNamespacedPodLog.firstCall.args[0]).toMatchObject({
      name: 'p-1',
      tailLines: 50,
      limitBytes: 1024 * 1024,
    })

    core.listNamespacedPod.resolves({ items: [] })
    expect(await runtime.readLogs(ref, { tailLines: 50 })).toBeNull()
  })
})
