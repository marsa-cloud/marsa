import type { ViewDatabaseDetailResponse } from '~/api/types.gen'
import { zViewDatabaseDetailResponse } from '~/api/zod.gen'

/** Stored config plus live status for one database. Status is read per request, never stored. */
export function useDatabaseDetail(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewDatabaseDetailResponse>(
    `database-detail-${slug}`,
    () => $api(`/v1/databases/${encodeURIComponent(slug)}`),
    { transform: (raw): ViewDatabaseDetailResponse => zViewDatabaseDetailResponse.parse(raw) },
  )
}
