import type { ListAppsResponse } from '~/api/types.gen'
import { zListAppsResponse } from '~/api/zod.gen'

/**
 * Read composable for the deployed-apps list (#128). Reactive read (method #1):
 * `useAsyncData` + `$api`, with the generated Zod schema validating the response
 * in the `transform` hook at the boundary. Backend: #126 (GET /v1/apps).
 */
export function useAppList() {
  const { $api } = useNuxtApp()
  return useAsyncData<ListAppsResponse>(
    'app-list',
    () => $api('/v1/apps'),
    { transform: (raw): ListAppsResponse => zListAppsResponse.parse(raw) },
  )
}
