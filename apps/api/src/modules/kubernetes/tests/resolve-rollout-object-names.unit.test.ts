import { before, describe, it } from 'node:test'

import type { V1Deployment, V1Pod, V1ReplicaSet } from '@kubernetes/client-node'
import { expect } from 'expect'

import { resolveRolloutObjectNames } from '#src/modules/kubernetes/resolve-rollout-object-names.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const DEPLOYMENT_UID = 'dep-uid-1'
const OTHER_DEPLOYMENT_UID = 'dep-uid-2'

function deployment(name: string, uid: string): V1Deployment {
  return { metadata: { name, uid } }
}

function ownedBy(uid: string) {
  return [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'owner', uid }]
}

function replicaSet(name: string, uid: string, ownerUid: string): V1ReplicaSet {
  return {
    metadata: {
      name,
      uid,
      ownerReferences: [
        { apiVersion: 'apps/v1', kind: 'Deployment', name: 'owner', uid: ownerUid },
      ],
    },
  }
}

function pod(name: string, ownerReplicaSetUid: string): V1Pod {
  return { metadata: { name, ownerReferences: ownedBy(ownerReplicaSetUid) } }
}

describe('resolveRolloutObjectNames', () => {
  before(() => TestBench.setupUnitTest())

  it("includes the deployment's own name", () => {
    const names = resolveRolloutObjectNames(deployment('my-app', DEPLOYMENT_UID), [], [])

    expect(names.has('my-app')).toBe(true)
  })

  it('includes owned ReplicaSets but excludes a sibling that shares a name prefix', () => {
    const owned = replicaSet('my-app-abc123', 'rs-owned', DEPLOYMENT_UID)
    // Same name prefix, but owned by a DIFFERENT deployment — must not bleed in.
    const sibling = replicaSet('my-app-2-def456', 'rs-sibling', OTHER_DEPLOYMENT_UID)

    const names = resolveRolloutObjectNames(
      deployment('my-app', DEPLOYMENT_UID),
      [owned, sibling],
      [],
    )

    expect(names.has('my-app-abc123')).toBe(true)
    expect(names.has('my-app-2-def456')).toBe(false)
  })

  it('includes Pods owned by an owned ReplicaSet and excludes pods of a sibling ReplicaSet', () => {
    const owned = replicaSet('my-app-abc123', 'rs-owned', DEPLOYMENT_UID)
    const sibling = replicaSet('my-app-2-def456', 'rs-sibling', OTHER_DEPLOYMENT_UID)
    const ownedPod = pod('my-app-abc123-p1', 'rs-owned')
    const siblingPod = pod('my-app-2-def456-p9', 'rs-sibling')

    const names = resolveRolloutObjectNames(
      deployment('my-app', DEPLOYMENT_UID),
      [owned, sibling],
      [ownedPod, siblingPod],
    )

    expect(names.has('my-app-abc123-p1')).toBe(true)
    expect(names.has('my-app-2-def456-p9')).toBe(false)
  })

  it('tolerates objects missing names, uids, or ownerReferences without throwing', () => {
    const namelessRs: V1ReplicaSet = { metadata: { uid: 'rs-x', ownerReferences: [] } }
    const namelessPod: V1Pod = { metadata: {} }

    const names = resolveRolloutObjectNames({ metadata: {} }, [namelessRs], [namelessPod])

    expect(names.size).toBe(0)
  })
})
