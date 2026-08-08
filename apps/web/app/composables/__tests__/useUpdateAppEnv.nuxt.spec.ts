import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { EnvSavedUnreadableError, useUpdateAppEnv } from '../useUpdateAppEnv'

const response = { slug: 'my-app', env: { LOG_LEVEL: 'debug' }, redeployRequired: true }

const handler = vi.fn()
registerEndpoint('/api/v1/apps/my-app/env', {
  method: 'PUT',
  handler: async (event) => {
    handler(await readBody(event))
    return response
  },
})

registerEndpoint('/api/v1/apps/off-contract/env', {
  method: 'PUT',
  handler: () => ({ slug: 'off-contract' }),
})

describe('useUpdateAppEnv.updateEnv', () => {
  it('PUTs the whole env record and returns the contract-validated response', async () => {
    const { updateEnv } = useUpdateAppEnv()

    const result = await updateEnv('my-app', { LOG_LEVEL: 'debug' })

    expect(handler).toHaveBeenCalledWith({ env: { LOG_LEVEL: 'debug' } })
    expect(result).toEqual(response)
  })

  it('flags an off-contract response distinctly, since the write already landed', async () => {
    const { updateEnv } = useUpdateAppEnv()

    await expect(updateEnv('off-contract', { A: '1' })).rejects.toThrow(EnvSavedUnreadableError)
  })
})
