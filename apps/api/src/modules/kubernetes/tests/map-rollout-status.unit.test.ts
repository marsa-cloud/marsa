import { before, describe, it } from 'node:test'

import type { V1Deployment, V1DeploymentCondition } from '@kubernetes/client-node'
import { expect } from 'expect'

import { mapRolloutStatus } from '#src/modules/kubernetes/map-rollout-status.js'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function deployment(conditions: V1DeploymentCondition[]): V1Deployment {
  return { status: { conditions } }
}

describe('mapRolloutStatus', () => {
  before(() => TestBench.setupUnitTest())

  it('returns NotFound when the deployment is null', () => {
    expect(mapRolloutStatus(null)).toBe(RolloutStatus.NotFound)
  })

  it('returns Failed when Progressing is False with ProgressDeadlineExceeded', () => {
    const result = mapRolloutStatus(
      deployment([{ type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded' }]),
    )

    expect(result).toBe(RolloutStatus.Failed)
  })

  it('returns Complete when the new replica set is available and Available is True', () => {
    const result = mapRolloutStatus(
      deployment([
        { type: 'Progressing', status: 'True', reason: 'NewReplicaSetAvailable' },
        { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' },
      ]),
    )

    expect(result).toBe(RolloutStatus.Complete)
  })

  it('returns Progressing while the rollout is still advancing', () => {
    const result = mapRolloutStatus(
      deployment([{ type: 'Progressing', status: 'True', reason: 'ReplicaSetUpdated' }]),
    )

    expect(result).toBe(RolloutStatus.Progressing)
  })

  it('returns Progressing when no conditions are present yet', () => {
    expect(mapRolloutStatus(deployment([]))).toBe(RolloutStatus.Progressing)
  })

  it('does not treat a NewReplicaSetAvailable Progressing without Available=True as Complete', () => {
    const result = mapRolloutStatus(
      deployment([
        { type: 'Progressing', status: 'True', reason: 'NewReplicaSetAvailable' },
        { type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable' },
      ]),
    )

    expect(result).toBe(RolloutStatus.Progressing)
  })

  it('treats a non-deadline Progressing=False as still Progressing, not Failed', () => {
    const result = mapRolloutStatus(
      deployment([{ type: 'Progressing', status: 'False', reason: 'ReplicaSetUpdated' }]),
    )

    expect(result).toBe(RolloutStatus.Progressing)
  })
})
