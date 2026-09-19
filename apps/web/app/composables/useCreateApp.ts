import type { CreateAppCommand, CreateAppResponse } from '~/api/types.gen'
import { zCreateAppResponse } from '~/api/zod.gen'

export function useCreateApp() {
  const { $api } = useNuxtApp()

  async function create(command: CreateAppCommand): Promise<CreateAppResponse> {
    return zCreateAppResponse.parse(await $api('/v1/apps', { method: 'POST', body: command }))
  }

  return { create }
}
