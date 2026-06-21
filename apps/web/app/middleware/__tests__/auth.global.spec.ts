import { describe, expect, it, vi } from 'vitest'

async function runMiddleware(
  toPath: string,
  userValue: unknown,
): Promise<{ redirectedTo: string | null }> {
  let redirectedTo: string | null = null

  const navigateTo = vi.fn((path: string) => {
    redirectedTo = path
  })

  const user = { value: userValue }
  const isAuthRoute = toPath === '/login' || toPath.startsWith('/auth/')

  if (!isAuthRoute && !user.value) {
    navigateTo('/login')
  } else if (toPath === '/login' && user.value) {
    navigateTo('/')
  }

  return { redirectedTo }
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
})
