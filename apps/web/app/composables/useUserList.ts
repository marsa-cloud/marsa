import type { ViewUserIndexResponse } from '~/api/types.gen'
import { zViewUserIndexResponse } from '~/api/zod.gen'

/** Read composable for the operator's user list (#63). Backend: GET /v1/users. */
export function useUserList() {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewUserIndexResponse>('user-list', () => $api('/v1/users'), {
    transform: (raw): ViewUserIndexResponse => zViewUserIndexResponse.parse(raw),
  })
}
