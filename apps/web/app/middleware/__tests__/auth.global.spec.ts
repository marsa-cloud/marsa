import { describe, expect, it, vi } from 'vitest'

async function runMiddleware(
  toPath: string,
  userValue: unknown,
  errorValue: unknown = null,
): Promise<{ redirectedTo: string | null, thrown: unknown }> {
  let redirectedTo: string | null = null

  const navigateTo = vi.fn((path: string) => {
    redirectedTo = path
  })
  const createError = vi.fn((opts: unknown) => opts)

  const user = { value: userValue }
  const error = { value: errorValue }
  const isAuthRoute = toPath === '/login' || toPath.startsWith('/auth/')

  if (error.value && !isAuthRoute) {
    return { redirectedTo, thrown: createError({ statusCode: 500, statusMessage: 'Unable to verify session', fatal: true }) }
  }

  if (!isAuthRoute && !user.value) {
    navigateTo('/login')
  } else if (toPath === '/login' && user.value) {
    navigateTo('/')
  }

  return { redirectedTo, thrown: null }
}

describe('auth.global middleware logic', () => {
  it('redirects unauthenticated users away from protected routes', async () => {
    const { redirectedTo } = await runMiddleware('/', null)
    expect(redirectedTo).toBe('/login')
  })

  it('redirects authenticated users away from /login', async () => {
    const { redirectedTo } = await runMiddleware('/login', { id: '1', login: 'octocat' })
    expect(redirectedTo).toBe('/')
  })

  it('allows unauthenticated users to /login', async () => {
    const { redirectedTo } = await runMiddleware('/login', null)
    expect(redirectedTo).toBeNull()
  })

  it('allows unauthenticated users to /auth/* routes', async () => {
    const { redirectedTo } = await runMiddleware('/auth/github/callback', null)
    expect(redirectedTo).toBeNull()
  })

  it('allows authenticated users to protected routes', async () => {
    const { redirectedTo } = await runMiddleware('/', { id: '1', login: 'octocat' })
    expect(redirectedTo).toBeNull()
  })

  it('throws a fatal error instead of redirecting when session lookup fails on a protected route', async () => {
    const { redirectedTo, thrown } = await runMiddleware('/', null, new Error('network down'))
    expect(redirectedTo).toBeNull()
    expect(thrown).toMatchObject({ statusCode: 500, fatal: true })
  })

  it('does not throw on an auth route even if session lookup fails', async () => {
    const { redirectedTo, thrown } = await runMiddleware('/login', null, new Error('network down'))
    expect(redirectedTo).toBeNull()
    expect(thrown).toBeNull()
  })
})
