import type { Page } from 'playwright-core'

export interface MockResponse {
  status?: number
  json?: unknown
}

/**
 * Intercept the SPA's `/api/v1/**` calls at the browser boundary and answer
 * them from a path→response map, so e2e journeys run without a live backend.
 * Unmapped paths return 404 so a missing stub fails loudly instead of hanging.
 */
export async function mockApi(page: Page, routes: Record<string, MockResponse>): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    const match = routes[path]
    if (!match) return route.fulfill({ status: 404, json: { message: `not mocked: ${path}` } })
    return route.fulfill({ status: match.status ?? 200, json: match.json ?? {} })
  })
}

export const AN_OPERATOR = { id: '1', login: 'octocat', role: 'operator' }
