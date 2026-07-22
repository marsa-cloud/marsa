import type { FetchError } from 'ofetch'
import type { ViewMeResponse } from '~/api/types.gen'
import { zViewMeResponse } from '~/api/zod.gen'

export function useCurrentUser() {
  const { $api } = useNuxtApp()

  return useAsyncData<ViewMeResponse | null>(
    'current-user',
    async (): Promise<ViewMeResponse | null> => {
      try {
        const raw = await $api('/v1/auth/me')
        return zViewMeResponse.parse(raw)
      } catch (error) {
        if ((error as FetchError).status === 401) return null
        throw error
      }
    },
  )
}
