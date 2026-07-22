import type { ViewAppIndexResponse } from '~/api/types.gen'
import { zViewAppIndexResponse } from '~/api/zod.gen'

/**
 * Read composable for the deployed-apps list (#128). Reactive read (method #1):
 * `useAsyncData` + `$api`, with the generated Zod schema validating the response
 * in the `transform` hook at the boundary. Backend: #126 (GET /v1/apps).
 */
export function useAppList() {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewAppIndexResponse>(
    'app-list',
    () => $api('/v1/apps'),
    { transform: (raw): ViewAppIndexResponse => zViewAppIndexResponse.parse(raw) },
  )
}
