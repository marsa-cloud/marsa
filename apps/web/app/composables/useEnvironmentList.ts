import type { EnvironmentSummary } from '~/api/types.gen'
import { zViewEnvironmentIndexResponse } from '~/api/zod.gen'

export function useEnvironmentList() {
  const { $api } = useNuxtApp()

  async function list(projectSlug: string): Promise<EnvironmentSummary[]> {
    const raw = await $api(`/v1/projects/${encodeURIComponent(projectSlug)}/environments`)
    return zViewEnvironmentIndexResponse.parse(raw).items
  }

  return { list }
}
