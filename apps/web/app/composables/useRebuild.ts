import type { BuildSummary } from '~/api/types.gen'
import { zBuildSummary } from '~/api/zod.gen'

export function useRebuild() {
  const { $api } = useNuxtApp()

  async function rebuild(slug: string): Promise<BuildSummary> {
    const raw = await $api(`/v1/apps/${encodeURIComponent(slug)}/builds`, { method: 'POST' })
    return zBuildSummary.parse(raw)
  }

  return { rebuild }
}
