import type { AppSummary, ViewAppIndexQueryKey } from '~/api/types.gen'
import { zViewAppIndexResponse } from '~/api/zod.gen'

/**
 * Accumulating read for the deployed-apps list (#128, paginated in #185).
 * Backend: GET /v1/apps.
 */
export function useAppList() {
  return useKeysetList<AppSummary, ViewAppIndexQueryKey>('/v1/apps', raw =>
    zViewAppIndexResponse.parse(raw),
  )
}
