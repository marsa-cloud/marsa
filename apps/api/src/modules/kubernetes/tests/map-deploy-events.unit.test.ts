import { before, describe, it } from 'node:test'

import type { CoreV1Event } from '@kubernetes/client-node'
import { expect } from 'expect'

import { mapDeployEvents } from '#src/modules/kubernetes/map-deploy-events.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('mapDeployEvents', () => {
  before(() => TestBench.setupUnitTest())

  it('maps a full legacy event into a neutral DeployEvent', () => {
    const events: CoreV1Event[] = [
      {
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        count: 4,
        lastTimestamp: new Date('2026-07-05T10:05:00.000Z'),
        involvedObject: { kind: 'Pod', name: 'my-app-abc123-xyz' },
        metadata: {},
      },
    ]

    expect(mapDeployEvents(events)).toEqual([
      {
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        count: 4,
        lastSeen: '2026-07-05T10:05:00.000Z',
        involvedObject: { kind: 'Pod', name: 'my-app-abc123-xyz' },
      },
    ])
  })

  it('falls back through eventTime then creationTimestamp for lastSeen', () => {
    const viaEventTime = mapDeployEvents([
      {
        reason: 'Scheduled',
        eventTime: new Date('2026-07-05T09:00:00.000Z'),
        involvedObject: { kind: 'Pod', name: 'p' },
        metadata: { creationTimestamp: new Date('2026-07-05T08:00:00.000Z') },
      },
    ])
    expect(viaEventTime[0].lastSeen).toBe('2026-07-05T09:00:00.000Z')

    const viaCreation = mapDeployEvents([
      {
        reason: 'Scheduled',
        involvedObject: { kind: 'Pod', name: 'p' },
        metadata: { creationTimestamp: new Date('2026-07-05T08:00:00.000Z') },
      },
    ])
    expect(viaCreation[0].lastSeen).toBe('2026-07-05T08:00:00.000Z')
  })

  it('defaults missing type to Normal and missing count to 1', () => {
    const [mapped] = mapDeployEvents([
      {
        reason: 'ScalingReplicaSet',
        message: 'Scaled up',
        lastTimestamp: new Date('2026-07-05T10:00:00.000Z'),
        involvedObject: { kind: 'Deployment', name: 'my-app' },
        metadata: {},
      },
    ])

    expect(mapped.type).toBe('Normal')
    expect(mapped.count).toBe(1)
  })

  it('reads a coalesced (series) event via lastObservedTime and series count', () => {
    const [mapped] = mapDeployEvents([
      {
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off',
        series: { count: 7, lastObservedTime: new Date('2026-07-05T11:00:00.000Z') },
        involvedObject: { kind: 'Pod', name: 'p' },
        metadata: {},
      },
    ])

    expect(mapped.count).toBe(7)
    expect(mapped.lastSeen).toBe('2026-07-05T11:00:00.000Z')
  })

  it('falls back to the epoch and empty involvedObject when the event is bare', () => {
    const [mapped] = mapDeployEvents([{ metadata: {} } as unknown as CoreV1Event])

    expect(mapped.lastSeen).toBe(new Date(0).toISOString())
    expect(mapped.involvedObject).toEqual({ kind: '', name: '' })
    expect(mapped.reason).toBe('')
  })
})
