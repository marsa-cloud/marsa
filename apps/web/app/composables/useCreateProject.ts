import type { CreateProjectCommand, CreateProjectResponse } from '~/api/types.gen'
import { zCreateProjectResponse } from '~/api/zod.gen'

export function useCreateProject() {
  const { $api } = useNuxtApp()

  async function create(command: CreateProjectCommand): Promise<CreateProjectResponse> {
    return zCreateProjectResponse.parse(
      await $api('/v1/projects', { method: 'POST', body: command }),
    )
  }

  return { create }
}
