import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import middleware from '../auth.global'

// Mutable holder the mocked composable reads when the middleware calls it.
const s = vi.hoisted(() => ({ user: null as unknown, error: null as unknown }))

const navigateTo = vi.hoisted(() => vi.fn((path: string) => path))
const createError = vi.hoisted(() => vi.fn((opts: unknown) => opts))

mockNuxtImport('useCurrentUser', () => () => ({ data: ref(s.user), error: ref(s.error) }))
mockNuxtImport('navigateTo', () => navigateTo)
mockNuxtImport('createError', () => createError)

const to = (path: string) => ({ path }) as never

beforeEach(() => {
  s.user = null
  s.error = null
  navigateTo.mockClear()
  createError.mockClear()
})

describe('auth.global middleware', () => {
  it('redirects unauthenticated users away from a protected route', async () => {
    await middleware(to('/'), to('/'))
    expect(navigateTo).toHaveBeenCalledWith('/login')
  })

  it('redirects an authenticated user off /login to the dashboard', async () => {
    s.user = { id: '1', login: 'octocat' }
    await middleware(to('/login'), to('/login'))
    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  it.each(['/login', '/auth/github/callback', '/setup/github'])(
    'lets an unauthenticated user reach the public route %s',
    async (path) => {
      await middleware(to(path), to(path))
      expect(navigateTo).not.toHaveBeenCalled()
    },
  )

  it('lets an authenticated user through to a protected route', async () => {
    s.user = { id: '1', login: 'octocat' }
    await middleware(to('/apps'), to('/apps'))
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('throws a fatal error when the session lookup fails on a protected route', async () => {
    s.error = new Error('network down')
    await expect(middleware(to('/'), to('/'))).rejects.toMatchObject({
      statusCode: 500,
      fatal: true,
    })
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('does not throw on a public route even when the session lookup fails', async () => {
    s.error = new Error('network down')
    await middleware(to('/login'), to('/login'))
    expect(createError).not.toHaveBeenCalled()
  })
})
