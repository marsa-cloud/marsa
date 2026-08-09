import type { UpdateUserRoleResponse, UserRole } from '~/api/types.gen'
import { zUpdateUserRoleResponse } from '~/api/zod.gen'

/** Imperative mutation for promoting or demoting a user (#63). */
export function useUpdateUserRole() {
  const { $api } = useNuxtApp()

  async function updateRole(uuid: string, role: UserRole): Promise<UpdateUserRoleResponse> {
    const raw = await $api(`/v1/users/${encodeURIComponent(uuid)}/role`, {
      method: 'PATCH',
      body: { role },
    })
    return zUpdateUserRoleResponse.parse(raw)
  }

  return { updateRole }
}
