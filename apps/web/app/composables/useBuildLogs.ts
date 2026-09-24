import type { ViewBuildLogsResponse } from '~/api/types.gen'
import { zViewBuildLogsResponse } from '~/api/zod.gen'

// Imperative: it runs from a click, and useAsyncData would cache the first build's log.
export function useBuildLogs() {
  const { $api } = useNuxtApp()

  async function read(slug: string, buildUuid: string): Promise<ViewBuildLogsResponse> {
    const raw = await $api(
      `/v1/apps/${encodeURIComponent(slug)}/builds/${encodeURIComponent(buildUuid)}/logs`,
    )
    return zViewBuildLogsResponse.parse(raw)
  }

  return { read }
}
