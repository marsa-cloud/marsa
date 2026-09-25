import type { DatabaseSummary, ViewDatabaseIndexQueryKey } from '~/api/types.gen'
import { zViewDatabaseIndexResponse } from '~/api/zod.gen'

/** Accumulating read for the databases list (#206). Backend: GET /v1/databases. */
export function useDatabaseList() {
  return useKeysetList<DatabaseSummary, ViewDatabaseIndexQueryKey>('/v1/databases', raw =>
    zViewDatabaseIndexResponse.parse(raw),
  )
}
