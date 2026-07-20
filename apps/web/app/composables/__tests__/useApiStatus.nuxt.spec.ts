import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useApiStatus } from '../useApiStatus'

const validStatus = {
  name: 'marsa-api',
  version: '1.2.3',
  commit: null,
  nodeEnv: 'test',
  uptimeSeconds: 42,
}

registerEndpoint('/api/v1/status', () => validStatus)

// Runs the composable in a real Nuxt context and hands back its refs, so we
// assert the composable's wiring (endpoint + boundary validation) rather than a
// component's markup.
function mountComposable() {
  let result!: ReturnType<typeof useApiStatus>
  return mountSuspended(
    defineComponent({
      async setup() {
        result = useApiStatus()
        await result
        return () => h('div')
      },
    }),
  ).then(() => result)
}

describe('useApiStatus', () => {
  it('reads GET /v1/status and returns the contract-validated payload', async () => {
    const { data } = await mountComposable()
    expect(data.value).toEqual(validStatus)
  })
})
