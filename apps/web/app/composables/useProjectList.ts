import type { ProjectSummary } from '~/api/types.gen'
import { zViewProjectIndexResponse } from '~/api/zod.gen'

export function useProjectList() {
  const { $api } = useNuxtApp()

  async function list(): Promise<ProjectSummary[]> {
    const raw = await $api('/v1/projects')
    return zViewProjectIndexResponse.parse(raw).items
  }

  return { list }
}
