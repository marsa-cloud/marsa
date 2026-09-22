import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useNodeList } from '../useNodeList'

const node = {
  name: 'node-a',
  labels: { 'kubernetes.io/hostname': 'node-a' },
  ready: true,
}

registerEndpoint('/api/v1/nodes', {
  method: 'GET',
  handler: () => ({ items: [node] }),
})

describe('useNodeList.list', () => {
  it('returns the cluster nodes', async () => {
    expect(await useNodeList().list()).toEqual([node])
  })
})
