import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { useGithubLogin } from '../useGithubCallback'

const handler = vi.fn(() => ({ id: '1', login: 'octocat' }))
const received = vi.fn()

registerEndpoint('/api/v1/auth/github/session', {
  method: 'POST',
  handler: async (event) => {
    received(await readBody(event))
    return handler()
  },
})

describe('useGithubLogin.completeLogin', () => {
  it('POSTs the callback code and state to the session endpoint', async () => {
    const { completeLogin } = useGithubLogin()

    await completeLogin('c', 's')

    expect(received).toHaveBeenCalledWith({ code: 'c', state: 's' })
  })

  it('rejects when the response does not match the contract', async () => {
    handler.mockReturnValueOnce({ id: '1' } as never)

    const { completeLogin } = useGithubLogin()

    await expect(completeLogin('c', 's')).rejects.toThrow()
  })
})
