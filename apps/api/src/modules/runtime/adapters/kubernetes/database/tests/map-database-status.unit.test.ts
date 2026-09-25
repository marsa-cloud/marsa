import { describe, it } from 'node:test'
import type { V1Pod, V1StatefulSet } from '@kubernetes/client-node'
import { expect } from 'expect'
import { mapDatabaseStatus } from '#src/modules/runtime/adapters/kubernetes/database/map-database-status.js'
import { DatabaseStatus } from '#src/modules/runtime/runtime.enums.js'

const statefulSet = (readyReplicas: number): V1StatefulSet => ({
  spec: { replicas: 1, selector: {}, serviceName: 'orders', template: {} },
  status: { readyReplicas, replicas: 1, availableReplicas: readyReplicas },
})

const podWaiting = (reason: string): V1Pod => ({
  status: {
    containerStatuses: [
      {
        name: 'orders',
        image: 'postgres:17.11',
        imageID: '',
        ready: false,
        restartCount: 0,
        state: { waiting: { reason } },
      },
    ],
  },
})

describe('mapDatabaseStatus', () => {
  it('reports not-found when the StatefulSet is absent', () => {
    expect(mapDatabaseStatus(null, [])).toBe(DatabaseStatus.NotFound)
  })

  it('reports ready once the single replica is ready', () => {
    expect(mapDatabaseStatus(statefulSet(1), [])).toBe(DatabaseStatus.Ready)
  })

  it('reports provisioning while no replica is ready yet', () => {
    expect(mapDatabaseStatus(statefulSet(0), [])).toBe(DatabaseStatus.Provisioning)
  })

  it('reports failed when the pod is stuck on a terminal waiting reason', () => {
    expect(mapDatabaseStatus(statefulSet(0), [podWaiting('CrashLoopBackOff')])).toBe(
      DatabaseStatus.Failed,
    )
    expect(mapDatabaseStatus(statefulSet(0), [podWaiting('ImagePullBackOff')])).toBe(
      DatabaseStatus.Failed,
    )
  })

  it('keeps a starting pod in provisioning rather than calling it failed', () => {
    expect(mapDatabaseStatus(statefulSet(0), [podWaiting('ContainerCreating')])).toBe(
      DatabaseStatus.Provisioning,
    )
  })
})
