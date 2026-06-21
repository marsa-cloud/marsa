import type { GetCurrentUserResponse } from '~/api/types.gen'
import { zGetCurrentUserResponse } from '~/api/zod.gen'

export function useCurrentUser() {
  const { $api } = useNuxtApp()

  return useAsyncData<GetCurrentUserResponse | null>(
    'current-user',
    async (): Promise<GetCurrentUserResponse | null> => {
      try {
        const raw = await $api('/v1/auth/me')
        return zGetCurrentUserResponse.parse(raw)
      } catch { return null }
    },
  )
}
