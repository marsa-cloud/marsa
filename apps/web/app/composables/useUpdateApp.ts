import type { UpdateAppCommand, UpdateAppResponse } from '~/api/types.gen'
import { zUpdateAppResponse } from '~/api/zod.gen'

export function useUpdateApp() {
  const { $api } = useNuxtApp()

  async function update(slug: string, command: UpdateAppCommand): Promise<UpdateAppResponse> {
    const raw = await $api(`/v1/apps/${encodeURIComponent(slug)}`, { method: 'PATCH', body: command })
    return zUpdateAppResponse.parse(raw)
  }

  return { update }
}
