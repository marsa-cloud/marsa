import type { V1Affinity, V1NodeSelectorRequirement } from '@kubernetes/client-node'
import type { NodePinSpec } from '#src/modules/runtime/runtime.types.js'

// Single term, so the weight only has to be a legal 1-100 value.
const PREFERRED_WEIGHT = 100

export function buildNodeAffinity(nodePin: NodePinSpec | null): V1Affinity | undefined {
  if (!nodePin) {
    return undefined
  }

  const matchExpressions: V1NodeSelectorRequirement[] = [
    { key: nodePin.key, operator: 'In', values: nodePin.values },
  ]

  if (nodePin.strategy === 'required') {
    return {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions }],
        },
      },
    }
  }

  return {
    nodeAffinity: {
      preferredDuringSchedulingIgnoredDuringExecution: [
        { weight: PREFERRED_WEIGHT, preference: { matchExpressions } },
      ],
    },
  }
}
