import type { ViewAppAttachmentIndexResponse } from '~/api/types.gen'
import { zViewAppAttachmentIndexResponse } from '~/api/zod.gen'

/** The databases attached to one app, with the variable names each one injects (#207). */
export function useAppAttachments(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewAppAttachmentIndexResponse>(
    `app-attachments-${slug}`,
    () => $api(`/v1/apps/${encodeURIComponent(slug)}/attachments`),
    {
      transform: (raw): ViewAppAttachmentIndexResponse =>
        zViewAppAttachmentIndexResponse.parse(raw),
    },
  )
}
