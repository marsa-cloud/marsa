import type { CreateEnvironmentCommand, CreateEnvironmentResponse } from '~/api/types.gen'
import { zCreateEnvironmentResponse } from '~/api/zod.gen'

export function useCreateEnvironment() {
  const { $api } = useNuxtApp()

  async function create(
    projectSlug: string,
    command: CreateEnvironmentCommand,
  ): Promise<CreateEnvironmentResponse> {
    const raw = await $api(`/v1/projects/${encodeURIComponent(projectSlug)}/environments`, {
      method: 'POST',
      body: command,
    })
    return zCreateEnvironmentResponse.parse(raw)
  }

  return { create }
}
