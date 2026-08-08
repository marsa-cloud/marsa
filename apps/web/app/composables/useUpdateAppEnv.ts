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
/**
 * The PUT succeeded but its body didn't match the contract (a client generated
 * against an older `openapi.json`, say). Distinct from a failed write, because
 * the stored env has already changed: the caller must still prompt for a
 * redeploy rather than reporting the save as failed.
 */
export class EnvSavedUnreadableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Environment variables were saved, but the response could not be read.', options)
    this.name = 'EnvSavedUnreadableError'
  }
}

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

    const parsed = zUpdateAppEnvResponse.safeParse(raw)
    if (!parsed.success) {
      throw new EnvSavedUnreadableError({ cause: parsed.error })
    }
    return parsed.data
  }

  return { updateEnv }
}
