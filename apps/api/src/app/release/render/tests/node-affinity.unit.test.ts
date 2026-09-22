import { describe, it } from 'node:test'
import { expect } from 'expect'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { buildNodeAffinity } from '#src/app/release/render/node-affinity.js'

const pin = (strategy: PinStrategy) => ({
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
    expect(buildNodeAffinity(pin(PinStrategy.Required))).toEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions }],
        },
      },
    })
  })

  it('renders a preferred pin as a weighted preference', () => {
    expect(buildNodeAffinity(pin(PinStrategy.Preferred))).toEqual({
      nodeAffinity: {
        preferredDuringSchedulingIgnoredDuringExecution: [
          { weight: 100, preference: { matchExpressions } },
        ],
      },
    })
  })
})
