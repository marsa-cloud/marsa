/**
 * Client for the delete endpoint. Imperative mutation like `useDeployApp` — a
 * user-triggered write, so it calls `$api` directly. No Zod parse: the endpoint
 * answers 204 with no body.
 */
export function useDeleteApp() {
  const { $api } = useNuxtApp()

  async function remove(slug: string): Promise<void> {
    await $api(`/v1/apps/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  }

  return { remove }
}
