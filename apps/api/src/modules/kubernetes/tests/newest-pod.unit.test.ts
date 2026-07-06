import { describe, it } from 'node:test'

import type { V1Pod } from '@kubernetes/client-node'
import { expect } from 'expect'

import { newestPod } from '#src/modules/kubernetes/newest-pod.js'

function pod(name: string, creationTimestamp?: string): V1Pod {
  return {
    metadata: {
      name,
      ...(creationTimestamp ? { creationTimestamp: new Date(creationTimestamp) } : {}),
    },
  }
}

describe('newestPod', () => {
  it('returns null for an empty list', () => {
    expect(newestPod([])).toBeNull()
  })

  it('picks the pod with the latest creationTimestamp regardless of order', () => {
    const pods = [
      pod('old', '2026-01-01T00:00:00Z'),
      pod('new', '2026-03-01T00:00:00Z'),
      pod('mid', '2026-02-01T00:00:00Z'),
    ]

    expect(newestPod(pods)?.metadata?.name).toBe('new')
  })

  it('prefers a timestamped pod over one missing a timestamp', () => {
    const pods = [pod('no-ts'), pod('has-ts', '2026-01-01T00:00:00Z')]

    expect(newestPod(pods)?.metadata?.name).toBe('has-ts')
  })

  it('still returns a pod when none carry a timestamp', () => {
    const result = newestPod([pod('a'), pod('b')])

    expect(result).not.toBeNull()
    expect(result?.metadata?.name).toBe('b')
  })
})
