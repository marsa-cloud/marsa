import type { ProjectSummary } from '~/api/types.gen'
import { zViewProjectIndexResponse } from '~/api/zod.gen'

const PICKER_LIMIT = 100

export function useProjectList() {
  const { $api } = useNuxtApp()

  async function list(): Promise<ProjectSummary[]> {
    const raw = await $api('/v1/projects', { query: { 'pagination[limit]': PICKER_LIMIT } })
    return zViewProjectIndexResponse.parse(raw).items
  }

  return { list }
}
