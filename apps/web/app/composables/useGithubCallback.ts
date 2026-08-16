import type { LocationQuery } from 'vue-router'
import * as z from 'zod'
import { zCompleteGithubLoginV1Response } from '~/api/zod.gen'

export type GithubDenial = 'cancelled' | 'declined'

export type GithubLoginOutcome
  = | { status: 'proceed', code: string, state: string }
    | { status: GithubDenial | 'failed' }

const denialQuery = z.object({ error: z.string().min(1) })

const loginQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})

// GitHub also sends error_description, but it is attacker-influenceable text
// and never actionable for the person reading it, so we branch on the code only.
export function parseGithubDenial(query: LocationQuery): GithubDenial | null {
  const denial = denialQuery.safeParse(query)
  if (!denial.success) return null
  return denial.data.error === 'access_denied' ? 'cancelled' : 'declined'
}

export function resolveGithubLoginQuery(query: LocationQuery): GithubLoginOutcome {
  const denial = parseGithubDenial(query)
  if (denial) return { status: denial }

  const parsed = loginQuery.safeParse(query)
  if (!parsed.success) return { status: 'failed' }

  return { status: 'proceed', ...parsed.data }
}

export function useGithubLogin() {
  const { $api } = useNuxtApp()

  async function completeLogin(code: string, state: string): Promise<void> {
    const raw = await $api('/v1/auth/github/session', {
      method: 'POST',
      body: { code, state },
    })
    zCompleteGithubLoginV1Response.parse(raw)
  }

  return { completeLogin }
}
