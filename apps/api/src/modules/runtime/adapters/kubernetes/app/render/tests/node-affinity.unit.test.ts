import { describe, it } from 'node:test'
import { expect } from 'expect'
import { buildNodeAffinity } from '#src/modules/runtime/adapters/kubernetes/app/render/node-affinity.js'
import { NodePinStrategy } from '#src/modules/runtime/runtime.enums.js'

const pin = (strategy: NodePinStrategy) => ({
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
    expect(buildNodeAffinity(pin(NodePinStrategy.Required))).toEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions }],
        },
      },
    })
  })

  it('renders a preferred pin as a weighted preference', () => {
    expect(buildNodeAffinity(pin(NodePinStrategy.Preferred))).toEqual({
      nodeAffinity: {
        preferredDuringSchedulingIgnoredDuringExecution: [
          { weight: 100, preference: { matchExpressions } },
        ],
      },
    })
  })
})
