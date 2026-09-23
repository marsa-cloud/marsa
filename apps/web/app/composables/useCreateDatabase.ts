import type { CreateDatabaseCommand, CreateDatabaseResponse } from '~/api/types.gen'
import { zCreateDatabaseResponse } from '~/api/zod.gen'

export function useCreateDatabase() {
  const { $api } = useNuxtApp()

  async function create(command: CreateDatabaseCommand): Promise<CreateDatabaseResponse> {
    return zCreateDatabaseResponse.parse(
      await $api('/v1/databases', { method: 'POST', body: command }),
    )
  }

  return { create }
}
