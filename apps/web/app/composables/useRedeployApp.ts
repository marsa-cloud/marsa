import type { RedeployAppResponse } from '~/api/types.gen'
import { zRedeployAppResponse } from '~/api/zod.gen'

/**
 * Client for the redeploy endpoint. Imperative mutation (method #2): redeploying
 * is a user-triggered write, so we call `$api` directly rather than
 * `useAsyncData`, and validate the response against the generated Zod schema at
 * the boundary.
 *
 * Takes no payload — the API re-reads the app's stored config server-side, so
 * env vars and pull credentials never round-trip through the browser.
 */
export function useRedeployApp() {
  const { $api } = useNuxtApp()

  async function redeploy(slug: string): Promise<RedeployAppResponse> {
    const raw = await $api(`/v1/apps/${encodeURIComponent(slug)}/redeploy`, { method: 'POST' })
    return zRedeployAppResponse.parse(raw)
  }

  return { redeploy }
}
