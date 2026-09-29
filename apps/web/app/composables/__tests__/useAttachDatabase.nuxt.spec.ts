import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useAttachDatabase } from '../useAttachDatabase'
import { useDetachDatabase } from '../useDetachDatabase'

const attached = vi.fn(() => ({
  databaseSlug: 'orders',
  alias: 'analytics',
  variables: ['ANALYTICS_DATABASE_URL'],
}))
const detached = vi.fn(() => null)

registerEndpoint('/api/v1/apps/my-app/attachments', { method: 'POST', handler: () => attached() })
registerEndpoint('/api/v1/apps/my-app/attachments/orders', {
  method: 'DELETE',
  handler: () => detached(),
})

describe('attachment mutations', () => {
  it('POSTs the attachment and returns the injected variable names', async () => {
    const response = await useAttachDatabase().attach('my-app', {
      databaseSlug: 'orders',
      alias: 'analytics',
    })

    expect(attached).toHaveBeenCalled()
    expect(response.variables).toEqual(['ANALYTICS_DATABASE_URL'])
  })

  it('DELETEs the attachment keyed by the database slug', async () => {
    await useDetachDatabase().detach('my-app', 'orders')

    expect(detached).toHaveBeenCalled()
  })
})
