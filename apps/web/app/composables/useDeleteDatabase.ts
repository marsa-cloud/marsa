/** Imperative mutation like `useDeleteApp`; the endpoint answers 204 with no body to parse. */
export function useDeleteDatabase() {
  const { $api } = useNuxtApp()

  async function remove(slug: string): Promise<void> {
    await $api(`/v1/databases/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  }

  return { remove }
}
