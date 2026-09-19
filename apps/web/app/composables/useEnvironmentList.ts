import type { EnvironmentSummary } from '~/api/types.gen'
import { zViewEnvironmentIndexResponse } from '~/api/zod.gen'

const PICKER_LIMIT = 100

export function useEnvironmentList() {
  const { $api } = useNuxtApp()

  async function list(projectSlug: string): Promise<EnvironmentSummary[]> {
    const raw = await $api(`/v1/projects/${encodeURIComponent(projectSlug)}/environments`, {
      query: { 'pagination[limit]': PICKER_LIMIT },
    })
    return zViewEnvironmentIndexResponse.parse(raw).items
  }

  return { list }
}
