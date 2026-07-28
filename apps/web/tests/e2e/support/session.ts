import { url } from '@nuxt/test-utils/e2e'
import type { BrowserContext } from 'playwright-core'

/**
 * The seeded operator's `marsa_session` cookie, captured from `seed-dev` at
 * runtime and passed in via env — it can't be hard-coded because the seed mints
 * a fresh session per database (CI starts from an empty DB each run). Tests that
 * need an authenticated browser call `authenticate(context)`; unauthenticated
 * tests simply don't.
 */
export const SEEDED_LOGIN = 'marsa-dev'

export function sessionCookie(): { name: string, value: string } {
  const raw = process.env.E2E_SESSION_COOKIE
  if (!raw) {
    throw new Error(
      'E2E_SESSION_COOKIE is not set. Run the API in test mode, seed it, and export the printed '
      + 'cookie — see apps/web/.claude/CLAUDE.md § Testing (E2E) or the CI "Start seeded API" step.',
    )
  }
  const eq = raw.indexOf('=')
  return { name: raw.slice(0, eq), value: raw.slice(eq + 1) }
}

export async function authenticate(context: BrowserContext): Promise<void> {
  const { name, value } = sessionCookie()
  await context.addCookies([{ name, value, url: url('/') }])
}
