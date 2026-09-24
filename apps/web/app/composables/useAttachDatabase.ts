import type { AttachDatabaseCommand, AttachDatabaseResponse } from '~/api/types.gen'
import { zAttachDatabaseResponse } from '~/api/zod.gen'

export function useAttachDatabase() {
  const { $api } = useNuxtApp()

  async function attach(
    appSlug: string,
    command: AttachDatabaseCommand,
  ): Promise<AttachDatabaseResponse> {
    return zAttachDatabaseResponse.parse(
      await $api(`/v1/apps/${encodeURIComponent(appSlug)}/attachments`, {
        method: 'POST',
        body: command,
      }),
    )
  }

  return { attach }
}
