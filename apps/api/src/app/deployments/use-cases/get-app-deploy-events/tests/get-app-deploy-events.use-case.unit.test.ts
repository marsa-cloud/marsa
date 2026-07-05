import { before, describe, it } from 'node:test'

import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import {
  GetAppDeployEventsUseCase,
  MAX_DEPLOY_EVENTS,
} from '#src/app/deployments/use-cases/get-app-deploy-events/get-app-deploy-events.use-case.js'
import type { DeployEvent } from '#src/modules/kubernetes/deploy-backend.types.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function event(overrides: Partial<DeployEvent> = {}): DeployEvent {
  return {
    type: 'Normal',
    reason: 'ScalingReplicaSet',
    message: 'Scaled up replica set my-app-abc123 to 1',
    count: 1,
    lastSeen: '2026-07-05T10:00:00.000Z',
    involvedObject: { kind: 'Deployment', name: 'my-app' },
    ...overrides,
  }
}

function build(events: DeployEvent[]) {
  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.readDeployEvents.resolves(events)
  return new GetAppDeployEventsUseCase(deployBackend)
}

describe('GetAppDeployEventsUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('maps each rollout event into the response shape', async () => {
    const usecase = build([
      event({
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        count: 4,
        lastSeen: '2026-07-05T10:05:00.000Z',
        involvedObject: { kind: 'Pod', name: 'my-app-abc123-xyz' },
      }),
    ])

    const result = await usecase.execute('my-app')

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toEqual({
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      count: 4,
      lastSeen: '2026-07-05T10:05:00.000Z',
      involvedObject: { kind: 'Pod', name: 'my-app-abc123-xyz' },
    })
  })

  it('orders events newest-first by lastSeen', async () => {
    const usecase = build([
      event({ reason: 'oldest', lastSeen: '2026-07-05T10:00:00.000Z' }),
      event({ reason: 'newest', lastSeen: '2026-07-05T10:10:00.000Z' }),
      event({ reason: 'middle', lastSeen: '2026-07-05T10:05:00.000Z' }),
    ])

    const result = await usecase.execute('my-app')

    expect(result.events.map((e) => e.reason)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('caps the response at MAX_DEPLOY_EVENTS, keeping the newest', async () => {
    const many = Array.from({ length: MAX_DEPLOY_EVENTS + 10 }, (_, i) =>
      event({
        reason: `evt-${i}`,
        // later index => later timestamp => newer
        lastSeen: `2026-07-05T10:${String(i).padStart(2, '0')}:00.000Z`,
      }),
    )

    const usecase = build(many)

    const result = await usecase.execute('my-app')

    expect(result.events).toHaveLength(MAX_DEPLOY_EVENTS)
    // newest kept: the highest-index event survives the cap
    expect(result.events[0].reason).toBe(`evt-${MAX_DEPLOY_EVENTS + 9}`)
  })

  it('returns an empty list when the deployment has no events (or does not exist)', async () => {
    const usecase = build([])

    const result = await usecase.execute('my-app')

    expect(result.events).toEqual([])
  })
})
