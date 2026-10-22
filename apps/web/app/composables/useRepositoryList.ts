import type { ViewRepositoryIndexResponse } from '~/api/types.gen'
import { zViewRepositoryIndexResponse } from '~/api/zod.gen'

export function useRepositoryList() {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewRepositoryIndexResponse>(
    'github-repositories',
    () => $api('/v1/github-app/repositories'),
    { transform: (raw): ViewRepositoryIndexResponse => zViewRepositoryIndexResponse.parse(raw) },
  )
}
