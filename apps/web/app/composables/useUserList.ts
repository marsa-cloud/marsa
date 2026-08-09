import type { UserSummary, ViewUserIndexQueryKey } from '~/api/types.gen'
import { zViewUserIndexResponse } from '~/api/zod.gen'

/** Accumulating read for the operator's user list (#63). Backend: GET /v1/users. */
export function useUserList() {
  return useKeysetList<UserSummary, ViewUserIndexQueryKey>('/v1/users', raw =>
    zViewUserIndexResponse.parse(raw),
  )
}
