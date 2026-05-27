import type { GetApiInfoResponse } from '~/api/types.gen'
import { zGetApiInfoResponse } from '~/api/zod.gen'

export function useApiStatus() {
  const { $api } = useNuxtApp()

  return useAsyncData<GetApiInfoResponse>('api-status', () => $api('/v1/status'), {
    // Validate at the boundary: throws if the response drifts from the contract.
    transform: (raw): GetApiInfoResponse => zGetApiInfoResponse.parse(raw),
  })
}
