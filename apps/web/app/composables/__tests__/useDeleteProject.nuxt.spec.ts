import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDeleteProject } from '../useDeleteProject'

const handler = vi.fn(() => null)
registerEndpoint('/api/v1/projects/demo', { method: 'DELETE', handler: () => handler() })
registerEndpoint('/api/v1/projects/busy', {
  method: 'DELETE',
  handler: () => {
    throw new Error('still has environments')
  },
})

describe('useDeleteProject.remove', () => {
  it('DELETEs the project', async () => {
    await useDeleteProject().remove('demo')
    expect(handler).toHaveBeenCalled()
  })

  it('propagates a refusal so the caller can show it', async () => {
    await expect(useDeleteProject().remove('busy')).rejects.toBeDefined()
  })
})
