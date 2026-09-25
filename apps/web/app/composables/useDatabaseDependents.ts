import type { ViewDatabaseDependentIndexResponse } from '~/api/types.gen'
import { zViewDatabaseDependentIndexResponse } from '~/api/zod.gen'

/** The apps still attached to one database — what a failed delete names (#207). */
export function useDatabaseDependents(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewDatabaseDependentIndexResponse>(
    `database-dependents-${slug}`,
    () => $api(`/v1/databases/${encodeURIComponent(slug)}/dependents`),
    {
      transform: (raw): ViewDatabaseDependentIndexResponse =>
        zViewDatabaseDependentIndexResponse.parse(raw),
    },
  )
}
