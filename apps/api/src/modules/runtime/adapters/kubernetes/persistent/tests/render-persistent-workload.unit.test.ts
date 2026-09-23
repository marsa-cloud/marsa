import { describe, it } from 'node:test'
import { expect } from 'expect'
import type { PersistentWorkloadSpec } from '#src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.js'
import { renderPersistentWorkload } from '#src/modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.js'
import { NodePinStrategy } from '#src/modules/runtime/runtime.types.js'

const spec = (overrides: Partial<PersistentWorkloadSpec> = {}): PersistentWorkloadSpec => ({
  name: 'orders',
  image: 'postgres:17.11',
  port: 5432,
  env: { PGDATA: '/var/lib/postgresql/data/pgdata' },
  secretEnv: [{ name: 'POSTGRES_PASSWORD', secret: 'orders-credentials', key: 'PGPASSWORD' }],
  volume: { mountPath: '/var/lib/postgresql/data', sizeGib: 10, storageClass: 'local-path' },
  readinessExec: ['pg_isready', '-U', 'postgres'],
  nodePin: null,
  ...overrides,
})

describe('renderPersistentWorkload', () => {
  it('renders a single-replica StatefulSet owning its data volume', () => {
    const { statefulSet } = renderPersistentWorkload(spec())

    expect(statefulSet.kind).toBe('StatefulSet')
    expect(statefulSet.metadata?.name).toBe('orders')
    expect(statefulSet.spec?.replicas).toBe(1)
    expect(statefulSet.spec?.serviceName).toBe('orders')
    expect(statefulSet.spec?.volumeClaimTemplates?.[0]?.metadata?.name).toBe('data')
    expect(statefulSet.spec?.volumeClaimTemplates?.[0]?.spec?.storageClassName).toBe('local-path')
    expect(statefulSet.spec?.volumeClaimTemplates?.[0]?.spec?.resources?.requests?.storage).toBe(
      '10Gi',
    )
    expect(statefulSet.spec?.persistentVolumeClaimRetentionPolicy).toEqual({
      whenDeleted: 'Delete',
      whenScaled: 'Delete',
    })
  })

  it('mounts the volume and wires plain and secret env onto the container', () => {
    const container =
      renderPersistentWorkload(spec()).statefulSet.spec?.template.spec?.containers[0]

    expect(container?.volumeMounts).toEqual([
      { name: 'data', mountPath: '/var/lib/postgresql/data' },
    ])
    expect(container?.env).toEqual([
      { name: 'PGDATA', value: '/var/lib/postgresql/data/pgdata' },
      {
        name: 'POSTGRES_PASSWORD',
        valueFrom: { secretKeyRef: { name: 'orders-credentials', key: 'PGPASSWORD' } },
      },
    ])
  })

  it('probes readiness by command and liveness by socket', () => {
    const container =
      renderPersistentWorkload(spec()).statefulSet.spec?.template.spec?.containers[0]

    expect(container?.readinessProbe?.exec?.command).toEqual(['pg_isready', '-U', 'postgres'])
    expect(container?.livenessProbe?.tcpSocket?.port).toBe(5432)
  })

  it('renders a plain ClusterIP Service and nothing HTTP-shaped', () => {
    const rendered = renderPersistentWorkload(spec())

    expect(rendered.service.spec?.type).toBe('ClusterIP')
    expect(rendered.service.spec?.ports).toEqual([{ port: 5432, targetPort: 5432 }])
    expect(Object.keys(rendered)).toEqual(['statefulSet', 'service'])
  })

  it('applies a required node pin as node affinity', () => {
    const { statefulSet } = renderPersistentWorkload(
      spec({
        nodePin: {
          key: 'kubernetes.io/hostname',
          values: ['node-a'],
          strategy: NodePinStrategy.Required,
        },
      }),
    )

    expect(
      statefulSet.spec?.template.spec?.affinity?.nodeAffinity
        ?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms,
    ).toEqual([
      { matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: ['node-a'] }] },
    ])
  })

  it('omits affinity entirely when the workload is unpinned', () => {
    const { statefulSet } = renderPersistentWorkload(spec())

    expect(statefulSet.spec?.template.spec?.affinity).toBeUndefined()
  })
})
