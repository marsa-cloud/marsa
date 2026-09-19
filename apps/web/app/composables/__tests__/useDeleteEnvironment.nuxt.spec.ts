import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDeleteEnvironment } from '../useDeleteEnvironment'

const handler = vi.fn(() => null)
registerEndpoint('/api/v1/projects/demo/environments/dev', {
  method: 'DELETE',
  handler: () => handler(),
})

describe('useDeleteEnvironment.remove', () => {
  it('DELETEs the environment under its project', async () => {
    await useDeleteEnvironment().remove('demo', 'dev')
    expect(handler).toHaveBeenCalled()
  })
})
