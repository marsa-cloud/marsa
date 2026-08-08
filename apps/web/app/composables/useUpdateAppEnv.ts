import type { UpdateAppEnvResponse } from '~/api/types.gen'
import { zUpdateAppEnvResponse } from '~/api/zod.gen'

/**
 * Client for the env-update endpoint. Imperative mutation (method #2): saving
 * env is a user-triggered write, so we call `$api` directly rather than
 * `useAsyncData`, and validate the response against the generated Zod schema at
 * the boundary.
 *
 * The write is a whole-record replace and persists only — the running container
 * keeps its old environment until the app is redeployed, which is why the
 * response carries `redeployRequired`.
 */
export function useUpdateAppEnv() {
  const { $api } = useNuxtApp()

  async function updateEnv(
    slug: string,
    env: Record<string, string>,
  ): Promise<UpdateAppEnvResponse> {
    const raw = await $api(`/v1/apps/${encodeURIComponent(slug)}/env`, {
      method: 'PUT',
      body: { env },
    })
    return zUpdateAppEnvResponse.parse(raw)
  }

  return { updateEnv }
}
