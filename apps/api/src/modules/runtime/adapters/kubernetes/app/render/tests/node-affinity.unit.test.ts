import { describe, it } from 'node:test'
import { expect } from 'expect'
import { buildNodeAffinity } from '#src/modules/runtime/adapters/kubernetes/app/render/node-affinity.js'
import type { PinStrategySpec } from '#src/modules/runtime/runtime.types.js'

const pin = (strategy: PinStrategySpec) => ({
  key: 'kubernetes.io/hostname',
  values: ['node-a', 'node-b'],
  strategy,
})

const matchExpressions = [
  { key: 'kubernetes.io/hostname', operator: 'In', values: ['node-a', 'node-b'] },
]

describe('buildNodeAffinity', () => {
  it('returns undefined when unpinned', () => {
    expect(buildNodeAffinity(null)).toBeUndefined()
  })

  it('renders a required pin as a nodeSelectorTerm', () => {
    expect(buildNodeAffinity(pin('required'))).toEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions }],
        },
      },
    })
  })

  it('renders a preferred pin as a weighted preference', () => {
    expect(buildNodeAffinity(pin('preferred'))).toEqual({
      nodeAffinity: {
        preferredDuringSchedulingIgnoredDuringExecution: [
          { weight: 100, preference: { matchExpressions } },
        ],
      },
    })
  })
})
